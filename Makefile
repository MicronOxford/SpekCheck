## Copyright (C) 2018 David Pinto <david.pinto@bioch.ox.ac.uk>
##
## Copying and distribution of this file, with or without modification,
## are permitted in any medium without royalty provided the copyright
## notice and this notice are preserved.  This file is offered as-is,
## without any warranty.

PACKAGE := SPEKcheck
VERSION := 0.1

## Configuration
##
## This Makefile should probably be generated by a configure script
## from a Makefile.in.  We are not doing that so instead of configure,
## users can set this via environment variables or Make options.  Like
## so:
##
##     make NPM=~/.local/bin/npm

BASE64 ?= base64
GZIP ?= gzip
ICOTOOL ?= icotool
MKDIR ?= mkdir
MKDIR_P ?= mkdir -p
NPM ?= npm
PYTHON ?= python
RSVG_CONVERT ?= rsvg-convert
SED ?= sed
SHASUM ?= shasum
TAR ?= tar
XXD ?= xxd
ZIP ?= zip

GZIP_ENV ?= --best

##
##
##

distdir := $(PACKAGE)-$(VERSION)

DIST_TARGETS := dist-gzip dist-zip


npm_css := \
  node_modules/bootstrap/dist/css/bootstrap.min.css

## The order of this dependencies matters because it's the order that
## will be used when creating the index.html and help.html files.
npm_js := \
  node_modules/jquery/dist/jquery.min.js \
  node_modules/popper.js/dist/umd/popper.min.js \
  node_modules/bootstrap/dist/js/bootstrap.min.js \
  node_modules/chart.js/dist/Chart.min.js

npm_licenses := \
  node_modules/jquery/LICENSE.txt \
  node_modules/bootstrap/LICENSE \
  node_modules/chart.js/LICENSE.md
  ## popper does not include a LICENSE file on their distribution but
  ## they have the MIT header on the min.js file that we include.

npm_files := \
  $(npm_css) \
  $(npm_js) \
  $(npm_licenses)


## The data files are a bit different, we will handle each of the data
## directories as one thing, rather than multiple individual files.
##
## The reason for this is that the data files can have any character
## on the name.  If we then use their filenames on bash commands, we
## need to be extra careful and we don't want to because that's really
## tricky (we can just quote them but then we have to handle quotes in
## the filename and anything else that may be expanded by the shell).
## Also, they can't be used as Make targets or pre-requesites at all
## because they may have whitespace on name.
data_dirs := \
  data/detectors \
  data/dyes \
  data/excitation \
  data/filters

data_indices := $(foreach dtype, $(data_dirs), $(dtype).json)


## The SPEKcheck releases includes all the files, and we even have a
## good portion of them committed to the repo because they are few,
## small, change rarely, and require special tools.  Still, list them
## separate so we can remove them all with maintainer-clean.
buildable_files := \
  help.html \
  images/favicon.ico \
  images/favicon.png \
  images/spekcheck-logo.png \
  images/visible-spectrum.png \
  index.html \
  $(data_indices) \
  $(npm_files)

DISTFILES := \
  COPYING \
  Makefile \
  NEWS \
  README \
  css/spekcheck.css \
  data/setups.json \
  images/README \
  images/spekcheck-logo.svg \
  js/spekcheck.js \
  src/create-spectrum.py \
  templates/spekcheck.html \
  $(buildable_files)


## Default target (first declared target) must be all (per GNU
## standards).  For the case of SPEKcheck, this is just DISTFILES.
all: $(DISTFILES)

help:
	@echo "Targets:"
	@echo "    serve        serve site at http://localhost:8000"
	@echo "    dist         create all distribution files (tar.gz and zip)"
	@echo "    dist-zip     create distribution zip file"
	@echo "    dist-gzip    create distribution tar.gz file"
	@echo ""
	@echo "    maintainer-clean"
	@echo "        Removes all files that can be rebuilt.  It may"
	@echo "        require special tools to do so though."


##
## Rules for the images, logos, etc.
##

images/visible-spectrum.png: src/create-spectrum.py
	$(PYTHON) $^ $@

## visible-spectrum.png is a prerequesite because it is linked from
## the svg file.
images/spekcheck-logo.png: images/spekcheck-logo.svg images/visible-spectrum.png
	$(RSVG_CONVERT) --format png $< > $@

images/favicon.png: images/spekcheck-logo.svg images/visible-spectrum.png
	$(RSVG_CONVERT) --format png --width 16 --height 16 $< > $@

## Not all browsers support png for their icons, so we need this
## conversion.  See https://caniuse.com/#feat=link-icon-png
images/favicon.ico: images/favicon.png
	$(ICOTOOL) --create --raw $< > $@


##
## Rules for the data stuff.
##

## This makes the files dependent on the directory which is mehh.  I'm
## a bit unsure about the implications and when the json file then
## becomes out of date.
%.json: %
	$(PYTHON) -c \
	    "import os, json; \
	     files = filter(lambda x: x.endswith('.csv'), os.listdir('$^')); \
	     print(json.dumps(map(lambda x: x[:-4], sorted(files)), \
	                      separators=(',',': '), indent=2));" \
	    > $@


##
## Rules for the external dependecies (npm packages)
##

npm_basedir := node_modules
npm_pkg_name = $(word 2, $(subst /, ,$(1)))
npm_pkg_json = $(npm_basedir)/$(1)/package.json

## We use npm to download all of our dependencies.  Because some of
## them are dependent on each other and npm will automatically get
## their dependencies, we have to prevent make from running in
## parallel.
.NOTPARALLEL:

define NPM_INSTALL_RULE
$(call npm_pkg_json,$1):
	$(NPM) install $1
endef

$(foreach file, $(npm_files), \
  $(eval $(file): $(call npm_pkg_json,$(call npm_pkg_name,$(file)))))

## sort removes duplicates which is what we want
npm_packages := \
  $(sort $(foreach file, $(npm_files),$(call npm_pkg_name,$(file))))

$(foreach pkg, $(npm_packages), \
    $(eval $(call NPM_INSTALL_RULE,$(pkg))))


##
## Rules for index.html and help.html
##

## We download the external dependencies via npm when preparing the
## package, and we check the integrity values of that.  This seems
## kinda pointless but the idea is to make it easier to have a
## configure-like option to have the files regenerated pointing to a
## CDN.

templates/link-includes.in: $(npm_css)
	$(RM) $@
	for FILE in $^ ; do \
	  INTEGRITY=`$(SHASUM) -b -a 384 "$$FILE" | $(XXD) -r -p | $(BASE64)`; \
	  echo '  <link rel="stylesheet" type="text/css"' >>\
	  echo '        href="'"$$FILE"'"' >> $@; \
	  echo '        integrity="sha384-'"$$INTEGRITY"'"' >> $@; \
	  echo '        crossorigin="anonymous"/>' >> $@; \
	done

templates/script-includes.in: $(npm_js)
	$(RM) $@
	for FILE in $^ ; do \
	  INTEGRITY=`$(SHASUM) -b -a 384 "$$FILE" | $(XXD) -r -p | $(BASE64)`; \
	  echo '  <script src="'"$$FILE"'"' >> $@; \
	  echo '          integrity="sha384-'"$$INTEGRITY"'"' >> $@; \
	  echo '          crossorigin="anonymous"></script>' >> $@; \
	done

%.html: templates/%.html.in templates/script-includes.in templates/link-includes.in
	$(SED) -e '/@EXTERNAL_SCRIPT_INCLUDES@/ {' \
	       -e '  r templates/script-includes.in' \
	       -e '  d' \
	       -e '}' \
	       -e '/@EXTERNAL_LINK_INCLUDES@/ {' \
	       -e '  r templates/link-includes.in' \
	       -e '  d' \
	       -e '}' \
	        $< > $@


##
## Rules for testing
##

serve: all
	$(PYTHON) -m SimpleHTTPServer

check:
	@echo "We should have but we don't have any tests yet."


##
## Rules to prepare distribution
##
## Creates a directory with the files to include in the distribution
## and build packages out of that.  The directory itself should be
## created anew each time to avoid having an old directory around with
## old files.

## Individual dist recipes call 'post_remove_distdir' at the end, so
## we need a way to disable it when calling multiple dist-* targets.
## Having this as a variable allows that.  See recipe for 'dist' which
## builds all DIST_TARGETS.  But we also need one that is not
## overridable to be used at the start of the distdir target, hence
## the two functions *remove_distdir.
remove_distdir = \
  if test -d "$(distdir)"; then \
    find "$(distdir)" -type d ! -perm -200 -exec chmod u+w {} ';' \
      && $(RM) -r "$(distdir)" \
      || { sleep 5 && $(RM) -r "$(distdir)"; }; \
  else :; fi

post_remove_distdir = $(remove_distdir)

dist:
	$(MAKE) $(DIST_TARGETS) post_remove_distdir='@:'
	$(post_remove_distdir)

distdir: $(DISTFILES)
	$(remove_distdir)
	$(MKDIR) "$(distdir)"
	$(MKDIR_P) $(addprefix $(distdir)/, \
	                       $(sort $(filter-out ./, $(dir $(DISTFILES)))))
	for FILE in $(DISTFILES); do \
	  cp "$$FILE" "$(distdir)/$$FILE"; \
	done
	## The data files are handled differently, because we don't
	## know their filenames.
	for DIR in $(data_dirs); do \
	  cp -R "$$DIR" "$(distdir)/$$DIR"; \
	done

dist-gzip: distdir
	@$(TAR) chof - $(distdir) | $(GZIP) $(GZIP_ENV) -c > $(distdir).tar.gz
	$(post_remove_distdir)

## We remove any old zip file before creating a new one, because if
## the zip file already exists, the zip command will add files to the
## existing archive instead of creating a new one.
dist-zip: distdir
	$(RM) $(distdir).zip
	$(ZIP) -rq $(distdir).zip $(distdir)
	$(post_remove_distdir)


## The 'clean' target removes files normally created by building the
## program.  The 'distclean' target would also remove files by
## configure so that only the files originally in the release are
## left.  The SPEKcheck releases, there's none, but keep the target
## for consistency.
clean:

distclean: clean

## Delete almost everything that can be reconstructed with this
## Makefile.
maintainer-clean: distclean
	@echo "This command is intended for maintainers to use"
	@echo "it deletes files that may require special tools to rebuild."
	$(RM) $(buildable_files)
	$(RM) -r $(npm_basedir)


.PHONY: \
  all \
  check \
  clean \
  dist \
  dist-gzip \
  dist-zip \
  distclean \
  distdir \
  help \
  maintainer-clean \
  serve
