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


SpekCheck.Spectra = Backbone.Model.extend({
    // Spectra for anything, possibly multiple spectrum for same
    // thing, associated with same wavelength.  For example, the
    // spectra for a dye would be:
    //
    //   {
    //     wavelength: [wavelengths (Float)],
    //     data: [
    //       [excitation spectra (Float)],
    //       [emission spectra (Float)],
    //     ],
    //   },
    defaults: {
        wavelength: [],
        data: [], // an array with one array of floats per spectrum
    },

    validate: function(attrs, options) {
        if (! attrs.wavelength instanceof Array)
            return "No 'wavelength' property for spectrum data";

        const numel = attrs.wavelength.length;
        for (let spectrum of attrs.data)
            if (spectrum.length !== numel)
                return "Spectrum arrays must all have the same length";
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
        spectra: new SpekCheck.Spectra({data: [[]]}),
        mode: 't',
    },

    validate: function(attrs, options) {
        if (! attrs.spectra.isValid)
            return attrs.spectra.validationError;

        if (attrs.spectra.data.length !== 1)
            return "Filter spectra should have only data for transmission";

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
        spectra: new SpekCheck.Spectra({data: [[]]}),
    },

    validate: function(attrs, options) {
        if (! attrs.spectra.isValid)
            return attrs.spectra.validationError;
        if (attrs.spectra.data !== 1)
            return "Excitation spectra should have only data for intensity";
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
        spectra: new SpekCheck.Spectra({data: [[], []]}),
        ext_coeff: 0.0,
        q_yield: 0.0,
    },

    validate: function(attrs, options) {
        if (! attrs.spectra.isValid)
            return attrs.spectra.validationError;
        if (attrs.spectra.data.length !== 2)
            return "Dye spectra should have 'absorption' and 'emission' data";

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
}
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


SpekCheck.SetupCollection = Backbone.Collection.extend({
    model: SpekCheck.Setup,
    url: SpekCheck.data_url + '/sets',

    fetch: function(options) {
        let collecttion = this;
        $.ajax({
            url: this.url,
            dataType: 'text',
            success: function(text) {
                let setups = SpekCheck.SetupCollection.parseSetupsFile(text);
                collection.reset(setups);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // We return an empty collection if we fail to get the
                // data.  Should we maybe raise an error?
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
    let SOURCES = new SpekCheck.ExcitationsCollection();
    SOURCES.fetch();
    let FILTERSETS_VIEW = new SpekCheck.ExcitationsView({
        el: $('#filterset-selector'),
        collection: SOURCES,
    });
    let DYES_VIEW = new SpekCheck.ExcitationsView({
        el: $('#dye-selector'),
        collection: SOURCES,
    });
    let SOURCES_VIEW = new SpekCheck.ExcitationsView({
        el: $('#source-selector'),
        collection: SOURCES,
    });

    let PLOT = new SpekCheck.SetupPlot({
        el: $('#setup-plot')[0].getContext("2d"),
        setup: new SpekCheck.Setup,
    });

    // new SpekCheck.View(...);
});




    // This should be bootstrapped during build time
