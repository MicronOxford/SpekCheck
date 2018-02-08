## Copyright (C) 2018 David Pinto <david.pinto@bioch.ox.ac.uk>
##
## Copying and distribution of this file, with or without modification,
## are permitted in any medium without royalty provided the copyright
## notice and this notice are preserved.  This file is offered as-is,
## without any warranty.

PYTHON ?= python
PORT ?= 8000

help:
	@echo "Targets:"
	@echo "    serve [PORT=8000]    serve site at http://localhost:8000"
	@echo "    update-index         update the data index files"

FILES = \
  images/visible-spectrum.png

DTYPES = \
  dyes \
  excitation \
  filters

DATA_INDEX_FILES = \
  $(foreach dtype, $(DTYPES), \
            data/$(dtype)/index.html)

images/visible-spectrum.png: src/create-spectrum.py
	$(PYTHON) $^ $@

update-index: $(DATA_INDEX_FILES)
	src/update-index-files.sh

serve: $(FILES)
	$(PYTHON) -m SimpleHTTPServer $(PORT)
