# SpekCheck
Calculate the spectral transmission of dyes through possibly complex
dichroic/filter series.

This tool shows the specific transmission of a dye through an arbitrary
number of filters and dichroics, which can be in reflection or
transmission. Additionally it shows the overall transmission
efficiency, enabling easy comparison between different possible
filter/dichroic combinations.

If the dye has absorption spectra it will calculate the
excitation efficiency and quantum yield will allow calculation of the
relative brightness (where 100% of Alexa-488 is 10.0).

. This currently is not passed through any
excitation filter or dichroic but this is to be added. Adding the
dye's extinction coefficient and quantum yield gives a measure of
relative brightness. We make no account of illumination intensity,
just the efficiency with which the dye is excited, its quantum yield and
the light collection efficiency.

You can pre-filter the visible filter sets using a URL of the form
http://www.micron.ox.ac.uk/software/spekcheck/?searchFilterSets=OMX
to search for filters with OMX in the name.

Can easily be run locally by using a basic python based web server,
"python -m SimpleHTTPServer", then connect to http://127.0.0.1:8000
from a web browser. This works very well as all the processing is done
on the client side in javascript.
