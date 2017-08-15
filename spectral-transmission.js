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
var lastui;
var lastevent;

/* Required page elements:
 * #fset    - the active filter set
 * #filters - a list of available filters
 * #dyes    - a list of available dyes
 */


function updatePlot() {
    console.log('Updating plot.');
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

function addFilter( event, ui) {
    // Add a filter to the active filter set.
    var el = ui.draggable.clone().removeClass('filterSpec').addClass('activeFilter');
    el.data('mode', 't')
    var buttons = $( "<span></span>").appendTo(el);
    var modeBtn = $(`<button class="modeButton">t</button>`).appendTo(buttons);
    modeBtn.button()
    modeBtn.click(function(){
        var newMode = {'t':'r', 'r':'t'}[el.data('mode')];
        el.data('mode', newMode);
        $( this ).text(newMode);
    });
    var delBtn = $(`<button class="delButton">x</button>`).appendTo(buttons);
    delBtn.button();
    delBtn.click(function(){el.remove()});
    $( "#fset" ).append(el);
    updatePlot();
}

function selectDye( event, ui) {
    // Update on dye selection.
    $(ui.selected).addClass("ui-selected").siblings().removeClass("ui-selected"); 
}

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
                div.data('source', value);
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
                div.data('source', value);
                divs.push(div);
            });
            $( "#dyes" ).append(divs);
            $( "#dyes" ).selectable({selected: selectDye});
        ;}
    });
    
    // To do - parse URL to select dye and populate fset.
});