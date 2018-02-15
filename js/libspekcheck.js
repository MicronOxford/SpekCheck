// Copyright (C) 2017 Mick Phillips <mick.phillips@gmail.com>
// Copyright (C) 2017 Ian Dobbie <ian.dobbie@bioch.ox.ac.uk>
// Copyright (C) 2018 David Pinto <david.pinto@bioch.ox.ac.uk>
//
// SpekCheck is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// SpekCheck is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with SpekCheck.  If not, see <http://www.gnu.org/licenses/>.

// TODO: The handling of URLs is a bit of a mess.  Some are static
//    methods, others are static properties, others are instance
//    methods.  This may prevent the reuse with other structures.


let SpekCheck = {};


SpekCheck.Spectrum = Backbone.Model.extend({
    defaults: {
        wavelength: [],
        data: [],
    },

    validate: function(attrs, options) {
        if (! attrs.wavelength instanceof Array)
            return "No 'wavelength' property for spectrum data";
        if (! attrs.data instanceof Array)
            return "No 'data' property for spectrum data";
        if (wavelength.length !== data.length)
            return "data and wavelength arrays must have the same length";
    },

    area: function() {
        // Return the area of the spectrum.
        // Clamps negative values to zero.
        var w;
        var v;
        [w,v] = this.interpolate();
        const area = 0.0;
        for (let i=1; i < w.length; i++)
            area += 0.5 * (Math.max(0, v[i]) + Math.max(0, v[i-1]))*(w[i] - w[i-1]);

        return area;
    },

    interpolate: function() {
    },

    multiplyBy: function(other) {
        // multiplies this spectrum by other
        // invalidates previously calculated _points
        this._points = null;
        this.interpolate();
        var oldMax = Math.max(...this._interp[1]);
        if (other instanceof Spectrum) {
            var m = other.interpolate()[1];
            for (var i = 0; i < this._interp[1].length; i ++) {
                this._interp[1][i] *= m[i];
            }
        } else if (Array.isArray(other)) {
            for (var i = 0; i < this._interp[1].length; i ++) {
                this._interp[1][i] *= other[i];
            }
        } else {
            for (var i = 0; i < this._interp[1].length; i ++) {
                this._interp[1][i] *= other;
            }
        }
    },

    rescale: function() {
        const data = this.get('data');
        if (Math.max(...data) > 10.0) {
            // Spectrum is probably in percent
            for (var i = 0; i < data.length; i++) {
                data[i] /= 100;
            }
        }
    },
}, {
    // static fromCSV(csv) {
    //     let wls = [];
    //     let val = [];
    //     for (let line of csv.split('\n')) {
    //         line = line.trim()
    //         if (line.startsWith('//') || line.length == 0)
    //             continue; // skip comments and empty lines

    //         // FIXME: this is really a hack and we should not support
    //         //        have this type of noise in the file.
    //         if (line.startsWith('Type')
    //             || line.startsWith('Name')
    //             || line.startsWith('wavelength'))
    //             continue; // skip headers

    //         let cols = (line.split(',')).map(x => parseFloat(x));
    //         if (cols.length != 2 || cols.some(x => isNan(x)))
    //             throw TypeError('unable to parse float numbers from file');

    //         wls.push(cols[0]);
    //         val.push(cols[1]);
    //     }
    //     let filter = new Filter({
    //         spectrum: new Spectrum({
    //             wavelength: wls,
    //             transmission: val,
    //         })
    //     });
    //     return filter;
    // }
});


SpekCheck.Filter = Backbone.Model.extend({
    defaults: {
        name: '',
        transmission: new SpekCheck.Spectrum(),
        mode: 't',
    },

    validate: function(attrs, options) {
        if (! attrs.transmission.isValid)
            return attrs.spectra.validationError;
        if (attrs.mode !== 'r' && attrs.mode !== 't')
            return 'invalid filter mode';
    },

    changeMode: function() {
        const new_mode = this.get('mode') === 't' ? 'r' : 't';
        this.set({mode: new_mode});
    },
},
{
    base_url: function() {
        return SpekCheck.data_url + '/filters';
    },

    parseFilterField: function(field) {
        // Parses a filter definition as it appears on the sets file,
        // i.e., 'filter_name [mode]' where mode is optional and R|T
        const field_parts = field.split(' ').map(x => x.trim());
        if (field_parts.length > 2)
            throw TypeError('invalid Filter definition ' + field);

        const attrs = {name: field_parts[0]};
        if (field_parts.length === 2)
            attrs.mode = field_parts[1].toLowerCase();
        return new SpekCheck.Filter(attrs);
    },
});


SpekCheck.Excitation = Backbone.Model.extend({
    defaults: {
        name: '',
        intensity: new SpekCheck.Spectrum(),
    },

    validate: function(attrs, options) {
        if (! attrs.spectra.isValid)
            return attrs.spectra.validationError;
    },
},
{
    base_url: function() {
        return SpekCheck.data_url + '/excitation';
    },
});


SpekCheck.Dye = Backbone.Model.extend({
    defaults: {
        name: '',
        absorption: new SpekCheck.Spectrum(),
        emission: new SpekCheck.Spectrum(),
        ext_coeff: 0.0,
        q_yield: 0.0,
    },

    validate: function(attrs, options) {
        if (! attrs.absorption.isValid)
            return attrs.absorption.validationError;
        if (! attrs.emission.isValid)
            return attrs.emission.validationError;

        // Do not change the comparison logic, because by comparing
        // for true, we are at the same type checking for the right
        // type (e.g., 'undefined<0', 'undefined>0', or 'String>0'
        // would return false).
        if (! (attrs.ext_coeff >= 0.0))
            return 'Extinction Coefficient not a positive number';
        if (! (attrs.q_yield >= 0.0))
            return 'Quantum Yield not a positive number';
    },
},
{
    base_url: function() {
        return SpekCheck.data_url + '/dyes';
    },
});


SpekCheck.Setup = Backbone.Model.extend({
    defaults: {
        name: '',
        dye: new SpekCheck.Dye,
        ex_source: new SpekCheck.Excitation,
        ex_filters: [],
        em_filters: [],
    },
},
{
    parseSetupLine: function(line) {
        // Expects line to be a setup definition.  It's the
        // responsability of the caller to make sure that file
        // comments and empty lines are filtered out.
        const line_parts = line.split(',').map(x => x.trim());
        const name = line_parts[0];
        const dye = new SpekCheck.Dye({name: line_parts[1]});
        const ex_source = new SpekCheck.Excitation({
            'name': line_parts[2],
        });

        const ex_filters = [];
        const em_filters = [];
        let ex_path = true; // looking at filters in ex path until we see '::'
        for (let filt of line_parts.slice(3)) {
            const c_idx = filt.search('::');
            if (c_idx >= 0) {
                if (! ex_path)
                    throw TypeError('more than one :: in set ' + name);
                ex_filters.push
                ex_path = false;
                em_filters.push
            }
            else if (ex_path)
                ex_filters.push
            else // already looking at emission path
                em_filters.push
        }
        const setup = new SpekCheck.Setup({
            'name': name,
            'dye': dye,
            'ex_source': ex_source,
            'ex_filters': ex_filters,
            'em_filters': em_filters,
        });
        return setup;
    },
});


SpekCheck.SetupsCollection = Backbone.Collection.extend({
    model: SpekCheck.Setup,

    url: function() {
        return SpekCheck.data_url + '/sets';
    },

    fetch: function(options) {
        let collection = this;
        $.ajax({
            url: this.url(),
            dataType: 'text',
            success: function(text) {
                let setups = SpekCheck.SetupsCollection.parseSetupsFile(text);
                collection.reset(setups);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // We return an empty collection if we fail to get the
                // data.  Should we maybe raise an error?
                console.log(textStatus);
                console.log(errorThrown);
                collection.reset([]);
            },
        });
    },
},
{
    parseSetupsFile: function(txt) {
        let setups = [];
        for (let line of txt.split('\n')) {
            line = line.trim();
            if (line.startsWith('//') || line.length === 0)
                continue; // skip comments and empty lines
            let setup = SpekCheck.Setup.parseSetupLine(line);
            setups.push(setup);
        }
        return setups;
    },
});


SpekCheck.DataCollection = Backbone.Collection.extend({
    comparator: 'name',

    // A base class for our collection of dyes, excitation sources,
    // and filters.
    url: function() {
        return this.model.base_url() + '.json';
    },

    fetch: function(options) {
        let collection = this;
        $.ajax({
            url: this.url(),
            dataType: 'json',
            success: function(data) {
                for (let i = 0; i < data.length; i++)
                    data[i] = {name: data[i]};
                collection.reset(data);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // We return an empty collection if we fail to get the
                // data.  Should we maybe raise an error?
                collection.reset([]);
            },
        });
    },
});


SpekCheck.ExcitationsCollection = SpekCheck.DataCollection.extend({
    model: SpekCheck.Excitation,
});

SpekCheck.DyesCollection = SpekCheck.DataCollection.extend({
    model: SpekCheck.Dye,
});

SpekCheck.FiltersCollection = SpekCheck.DataCollection.extend({
    model: SpekCheck.Filter,
});


SpekCheck.ExcitationsView = Backbone.View.extend({
    tagName: 'select',

    template: _.template('<option value="<%= name %>"><%= name %></option>\n'),

    initialize: function() {
        // Ws just re-render whole thing even after adding a single
        // element.  Maybe we should rethink it.
        this.listenTo(this.collection, 'reset', this.render);
        this.listenTo(this.collection, 'add', this.render);
        this.render();
    },

    render: function(){
        let options = this.collection.models.map(
            x => this.template({name: x.get('name')}));
        this.$el.html(options);
        return this;
    },

});


SpekCheck.SetupPlot = Backbone.View.extend({
    tagName: 'canvas',

    // LineDash styles to use on spectra plots.
    dashes: [[8,4], [16,4], [4,8,4], [4,8,8]],

    initialize: function() {
        this.plot = new Chart(this.el, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'transmitted',
                    data: [],
                    borderWidth: 1,
                    borderColor: 'rgba(0, 0, 0, 0.5)',
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                showLines: true,
                scales: {
                    xAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: 'Wavelength / nm',
                        }
                    }]
                }
            }
        });
        this.listenTo(this.setup, 'change', this.render);
        this.render();
    },

    render: function() {
        return this;
    },
},
{
    wavelengthToHue: function(wl) {
        // Convert a wavelength to HSL-alpha string.
        return Math.max(0.0, Math.min(300, 650-wl)) * 0.96;
    },
});



// All our data is in CSVish files.  This provides an interface to our
// collection of filters, sets, etc.
//
//  We don't have a RESTful API.  We could fake it during the build
// step, by reading the files in our data directory and generate an
// appropriate directory structure with json content.  However, we
// want to make it possible for users to import their CSVish files
// which means we will need to have javascript code to read them
// anyway.
class SpekCheckSync {
    sync(method, model, options) {
    }

    sync_create() {
    }
    sync_delete() {
    }
    sync_read() {
    }
    sync_update() {
    }
}

$(document).ready(function() {
    SpekCheck.data_url = '../data';
    let dyes = new SpekCheck.DyesCollection();
    let setups = new SpekCheck.SetupsCollection();
    let sources = new SpekCheck.ExcitationsCollection();
    for (let x of [dyes, setups, sources])
        x.fetch();

    let setups_view = new SpekCheck.ExcitationsView({
        el: $('#setup-selector'),
        collection: setups,
    });
    let dyes_view = new SpekCheck.ExcitationsView({
        el: $('#dye-selector'),
        collection: dyes,
    });
    let sources_view = new SpekCheck.ExcitationsView({
        el: $('#source-selector'),
        collection: sources,
    });

    let plot = new SpekCheck.SetupPlot({
        el: $('#setup-plot')[0].getContext("2d"),
        setup: new SpekCheck.Setup,
    });

    // new SpekCheck.View(...);
});
