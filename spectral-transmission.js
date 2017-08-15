/* -*- coding: utf-8
 * Spectral Transmission tool
 *
 * Copyright 2017 Mick Phillips (mick.phillips@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Extensions to strip from source filenames, and files to exclude.
var FN_EXCLUDE = ['.csv', '.Csv', 'CSV', 'index.html'];
// The set of active filters.
var FSET = [];
var CHART = null;
var lastui;
var lastevent;

var WLMIN = 300.0;
var WLMAX = 800.0;
var WLSTEP = 1.0;

/* Required page elements:
 * #fset    - the active filter set
 * #filters - a list of available filters
 * #dyes    - a list of available dyes
 */



function processData(thing) {
    // Parse csv and resample.
    var csv = thing.data().raw.split('\n');
    var wls = []
    var values = []
    for (let [index, line] of csv.entries()) {
        if (null !== line.match(/^\s?([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)[\w,;:\t]([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/)) {
            var wl, value;
            [wl, value] = line.trim().split(/[,;:\s\t]/);
            wls.push(wl);
            values.push(value);
        }
    }
    // interpolate; assumes input data is sorted by wavelength.
    var interpolated = []
    var i = 1; // Index into original data.
    var dw = wls[1] - wls[0];
    var dv = values[1] - values[0];
    console.log(dw, dv, values[1], values[0], wls[1], wls[0]);
    for (wl = WLMIN; wl <= WLMAX; wl += WLSTEP) {
        if (wl > wls[i]) {
            i += 1;
            dw = wls[i] - wls[i];
            dv = values[i] - values[i];
        }
        interpolated.push([wl, values[i-1] + (wl - wls[i-1]) * dv/dw]);
    }
    thing.data('interpolated', interpolated);
}


function fetchItemData(thing) {
    // Fetch data for item if not already available.
    // Used deferred item to allow concurrent fetches.
     var d = $.Deferred();
     if (thing.data().raw == undefined) {
        $.get(thing.data().source, 
            function(resp){
                thing.data('raw', resp);
                processData(thing);
                d.resolve();
            }, 
            'text');
    } else {
        d.resolve();
    }
     return d;
}


function updatePlot() {
    var filters = $( "#fset .activeFilter" );
    var dye = $( "#dyes .ui-selected");
    var chart = $( "#chart");

    // Fetch all data with concurrent calls.
    var defer = [];   
    if (dye.length > 0){
        defer.push(fetchItemData(dye));
    }
    $('.activeFilter').each(function (index) {
        defer.push[fetchItemData( $( this ) )];
    })
    // When all the data is ready, to the calculation and draw the plot.
    $.when.apply(null, defer).then(function(){drawPlot()});
}


function drawPlot() {
    console.log("Drawing the plot.")

    var ctx = $( "#chart")[0].getContext('2d');
        //CHART = new Chart(ctx, {
        //    type: 'scatter'
        //});

    var datasets = []
    $(".activeFilter").each(function( index ) {datasets.push(
            $( this ).data('interpolated').map(function (row) {
            return {x:row[0], y:row[1]}; 
        }) }) })


    lastui = datasets;


        CHART = new Chart(ctx, {
            type: 'line',
            data: [1,2,3,3,2,1],
            options: ''});

}


function parseSources( sources )  {
    // Parse a \n-separated list of source files.
    var filters = {};
    for (var file of sources.split('\n')) {
        var name = file;
        for (var excl of FN_EXCLUDE) {
            name = name.split(excl).join("");
        }
        if (name.length > 0) {
            filters[name] = file;
        }
    }
    return filters
}


//=== UI INTERACTION FUNCTIONS ===//
function addFilter( event, ui) {
    // Add a filter to the active filter set.
    var el = ui.draggable.clone(true).removeClass('filterSpec').addClass('activeFilter');
    el.data('mode', 't')
    var buttons = $( "<span></span>").appendTo(el);
    var modeBtn = $(`<button class="modeButton">t</button>`).appendTo(buttons);
    modeBtn.button()
    modeBtn.click(function(){
        var newMode = {'t':'r', 'r':'t'}[el.data('mode')];
        el.data('mode', newMode);
        $( this ).text(newMode);
        updatePlot();
    });
    var delBtn = $(`<button class="delButton">x</button>`).appendTo(buttons);
    delBtn.button();
    delBtn.click(function(){
        el.remove();
        updatePlot();});
    $( "#fset" ).append(el);
    updatePlot();
}

function selectDye( event, ui) {
    // Update on dye selection.
    $(ui.selected).addClass("ui-selected").siblings().removeClass("ui-selected");
    updatePlot();
}


//=== DOCUMENT READY===//
$( document ).ready(function() { 
    // Populate list of filters
    $.ajax(
        {url: "./filters",
         data: "",
         dataType: "text",
         success: function( data ) {
            var filters = parseSources(data);
            var divs = []
            $.each(filters, function(key, value) {
                var div = $( `<div><label>${key}</label></div>`);
                div.addClass( "filterSpec" );
                div.data('source', 'filters/' + value);
                divs.push(div);
            });
            $( "#filters" ).append(divs);
            $ ( ".filterSpec").draggable({helper: "clone", cursor:"move"});
        }
    });
    $( "#fset").droppable({
        accept: ".filterSpec",
        drop: addFilter
    });
    
    // Populate list of dyes
    $.ajax(
        {url: "./dyes",
         data: "",
         dataType: "text",
         success: function( data ) {
            var dyes = parseSources(data);
            var divs = []
            $.each(dyes, function(key, value) {
                var div = $(`<div>${key}</div>`);
                div.data('source', 'dyes/' + value);
                divs.push(div);
            });
            $( "#dyes" ).append(divs);
            $( "#dyes" ).selectable({selected: selectDye});
        ;}
    });

    // To do - parse URL to select dye and populate fset.
});