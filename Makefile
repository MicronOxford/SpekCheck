## Copyright (C) 2018 David Pinto <david.pinto@bioch.ox.ac.uk>
##
## Copying and distribution of this file, with or without modification,
## are permitted in any medium without royalty provided the copyright
## notice and this notice are preserved.  This file is offered as-is,
## without any warranty.

PYTHON ?= python
PORT ?= 8000

INKSCAPE ?= inkscape

help:
	@echo "Targets:"
	@echo "    serve [PORT=8000]    serve site at http://localhost:8000"
	@echo "    update-data          update the data json files"

FILES = \
  images/visible-spectrum.png \
  images/spekcheck-logo.png

DATA_COLLECTIONS = \
  data/detectors.json \
  data/dyes.json \
  data/excitation.json \
  data/filters.json

## This makes the files dependent on the directory which is mehh.
## Weird things happen because of it.
%.json: %
	$(PYTHON) -c \
	    "import os, json; \
	     files = filter(lambda x: x.endswith('.csv'), os.listdir('$^')); \
	     print(json.dumps(map(lambda x: x[:-4], sorted(files)), \
	                      separators=(',',': '), indent=2));" \
	    > $@

update-data: $(DATA_COLLECTIONS)

%.png: %.svg
	$(INKSCAPE) --export-area-drawing --export-png=$@ $^

images/visible-spectrum.png: src/create-spectrum.py
	$(PYTHON) $^ $@

serve: $(FILES)
	$(PYTHON) -m SimpleHTTPServer $(PORT)
