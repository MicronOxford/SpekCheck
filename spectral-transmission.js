var FN_EXCLUDE = ['.csv', '.Csv', 'CSV', 'index.html\n'];

var fset = []

function parseSources( names )  {
    for (var excl of FN_EXCLUDE) {
        names = names.split(excl).join("");
    }
    return names.split("\n");
}

function addFilter( event, ui) {
    console.log(event);
    console.log(event.target);
    console.log(ui.draggable.text());
}


$( document ).ready(function() { 
    $.ajax(
        {url: "./filters",
         data: "",
         dataType: "text",
         success: function( data ) {
            var filters = parseSources(data);
            var html = ""
            for (var f of filters) {
                console.log(f);
                html += "<div class=filterSpec>"
                html += f;
                html += "</div>";
            }
            $( "#filters" ).html( html );
            //for (var f of $( ".draggable" ) ){ f.draggable(); }
            $ ( ".filterSpec").draggable({helper: "clone", cursor:"move"});
        }
    });
    
    $.ajax(
        {url: "./dyes",
         data: "",
         dataType: "text",
         success: function( data ) {
            var dyes = parseSources(data);
            $( "#dyes" ).html( dyes.join("<br/>") );}
        });    

    $( "#fset").droppable({
        accept: ".filterSpec",
        drop: addFilter
    });
});