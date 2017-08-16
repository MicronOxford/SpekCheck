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
var CHART = null;
var SPECTRA = {};

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


// Spectrum constructor.
function Spectrum(source, name) {
    this.source = source;   // source url
    this.name = name;       // name
    this.raw=null;          // raw data after fetch
    this.interp=null;       // interpolated data
    this.points=null;       // points as [{x: , y:}, ...]

    this.fetch = function ( ){
        // Fetch data for item if not already available.
        // Used deferred item to allow concurrent fetches.
        var d = $.Deferred();
        if (this.raw === null) {
        $.get(this.source,
            $.proxy(function(resp){
                this.raw = resp;
                this.interp = interpolate(this.raw);
                this.points = this.interp.map(function (row) {return {x:row[0], y:row[1]}});
                d.resolve();
            }, this),
            'text');
        } else {
            d.resolve();
        }
        return d;
    }
}


function interpolate(raw) {
    // Parse csv and resample.
    var csv = raw.split('\n');
    var wls = []
    var values = []
    for (let [index, line] of csv.entries()) {
        if (null !== line.match(/^\s?([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)[\w,;:\t]([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/)) {
            var wl, value;
            [wl, value] = line.trim().split(/[,;:\s\t]/);
            wls.push(parseFloat(wl));
            values.push(parseFloat(value));
        }
    }
    // interpolate; assumes input data is sorted by wavelength.
    var interpolated = []
    var i = 1; // Index into original data.
    var dw = wls[1] - wls[0];
    var dv = values[1] - values[0];
    for (wl = WLMIN; wl <= WLMAX; wl += WLSTEP) {
        if (wl > wls[i]) {
            i += 1;
            dvdw = (values[i] - values[i]) / wls[i] - wls[i];
        }
        interpolated.push([wl, values[i-1] + (wl - wls[i-1]) * dv/dw]);
    }
    return interpolated;
}


function updatePlot() {
    var dye = [];
    var filters = [];
    var filterModes = [];

    $( "#dyes .ui-selected").each(function() {dye.push($(this).data().key)})
    $( "#fset .activeFilter").each(function() {filters.push($(this).data().key)})
    $( "#fset .activeFilter").each(function() {filterModes.push($(this).data().mode)})

    // Fetch all data with concurrent calls.
    var defer = [];   
    if (dye.length > 0){
        defer.push(SPECTRA[dye[0]].fetch());
    }

    for (var f of filters) {
        defer.push(SPECTRA[f].fetch());
    }

    // When all the data is ready, do the calculation and draw the plot.
    $.when.apply(null, defer).then(function(){drawPlot(dye[0], filters, filterModes)});
}


function deepCopy( src ) {
    var i, target;
    if ( Array.isArray( src ) ) {
        target = src.slice(0);
        for( i = 0; i < target.length; i+=1 ) {
            target[i] = deepCopy( target[i] );
        }
        return target;
    } else {
        return src;
    }
}

function drawPlot(dye, filters, filterModes) {
    if (!CHART) {
        var ctx = $( "#chart")[0].getContext('2d');
        CHART = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'transmitted',
                    data: [],
                }]
            }
        })
    }

    var trans = null;
    if (dye) {
        console.log('Setting trans=dye.')
        trans = deepCopy(SPECTRA[dye].interp);
    }

    for ([findex, filter] of filters.entries()) {
        if (trans === null) {
            trans = deepCopy(SPECTRA[filter].interp);
            console.log('Setting trans=filter[0].')
            continue
        }
        var refl = ['r','R'].indexOf(filterModes[findex]) > -1;
        console.log(`modulating by filter ${findex}`)
        for (i=0; i<trans.length; i+=1) {
            if (refl) {
                trans[i][1] *= 1 - SPECTRA[filter].interp[i][1];
            } else {
                trans[i][1] *= SPECTRA[filter].interp[i][1];
            }
        }
    }

    skeys = [];
    $("#dyes .ui-selected").each(function() {skeys.push($(this).data().key)});
    $(".activeFilter").each(function() {skeys.push($(this).data().key)});

    var traces = CHART.data.datasets.map( item => item.label );
    var toRemove = traces.filter(item => skeys.indexOf(item) === -1);
    var toAdd = skeys.filter(item => traces.indexOf(item) === -1 );

    for (var key of toRemove) {
        if (key == 'transmitted') { continue }
        CHART.data.datasets.splice(
            CHART.data.datasets.indexOf(
                CHART.data.datasets.filter(item => item.label == key)[0]), 1);
    }

    for (var key of toAdd) {
        CHART.data.datasets.push({
            label: key,
            data: SPECTRA[key].points
        });
    }

    var transTrace = CHART.data.datasets.filter( item => item.label == 'transmitted')[0]
    transTrace.data = trans.map(function (row) {return {x:row[0], y:row[1]}});

    CHART.update();
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
    // Populate list of filters, and store SPECTRA key on the div.data
    $.ajax(
        {url: "./filters",
         data: "",
         dataType: "text",
         success: function( resp ) {
            var filters = parseSources(resp);
            var divs = []
            $.each(filters, function(key, value) {
                SPECTRA[key] = new Spectrum(`filters/${value}`, key);
                var div = $( `<div><label>${key}</label></div>`);
                div.addClass( "filterSpec" );
                div.data('key', key);
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
    
    // Populate list of dyes, and store SPECTRA key on the div.data
    $.ajax(
        {url: "./dyes",
         data: "",
         dataType: "text",
         success: function( data ) {
            var dyes = parseSources(data);
            var divs = []
            $.each(dyes, function(key, value) {
                var div = $(`<div>${key}</div>`);
                SPECTRA[key] = new Spectrum(`dyes/${value}`, key);
                div.data('key', key);
                divs.push(div);
            });
            $( "#dyes" ).append(divs);
            $( "#dyes" ).selectable({selected: selectDye});
        ;}
    });

    // To do - parse URL to select dye and populate fset.
});