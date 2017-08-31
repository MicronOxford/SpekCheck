# spectral-transmission
Calculate the spectral transmission of dyes through possibly complex
dichroic/filter series. 

This tool shows the specific transmission of a dye through an arbitary
number of filters and dichroics, which can be in reflection or
transmission. Additionally it shows the overall transmission
efficency, enabling easy comparision between differenet poissible
filter/dichroic combinations. 

Can easily be run locally by using a basic python based web server,
"python -m SimpleHTTPServer", then connect to http://127.0.0.1:8000
from a web browser. This works very well as all the processing is done
on the client side in javascript.
