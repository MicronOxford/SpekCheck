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
},
{
    parseHeader: function(header, header_map) {
        // Args:
        //     header(Array): one item per text line
        //     header_map(Object): see doc for parseFile
        //
        // Returns:
        //     An Object of attributes, keys taken from header_map
        //     values.
        const attrs = {};
        for (let line of header) {
            for (let header_key of Object.keys(header_map)) {
                if (line.startsWith(header_key)
                    && line[header_key.length] === ':') {
                    const attr_name = header_map[header_key];
                    if (attr_name === null)
                        break; // null means value to be ignored

                    // We may need to rethink this in the future.  For
                    // now, all the values we have on the header are
                    // numeric so this is fine.  But if we ever have
                    // different types, we may need to pass a parse
                    // function together with the attribute name.
                    const val = parseFloat(line.slice(header_key.length +2));
                    if (isNaN(val))
                        throw TypeError('invalid value for ' + header_key)

                    attrs[header_map[header_key]] = val;
                    break; // found it, so move to next line
                }
            }
            // We may get here without having recognized the key.
            // Well, continue anyway, we will check at the end of
            // parsing the header for complete attributes.
        }

        // Confirm we got all properties from the header.
        for (let attr_name of Object.values(header_map))
            if (attr_name !== null && attrs[attr_name] === undefined)
                throw TypeError('missing ' + attr_name + ' from header');

        return attrs;
    },

    parseCSV: function(csv) {
        // Args:
        //    csv(Array): one item per line.
        //
        // Returns:
        //    An Object with the csv first line as property names, and
        //    Spectrum objects as values.
        // First line of CSV content is still an header.  Tells us two
        // things: 1) the number of columns, 2) name of the spectrum
        // used for attribute when calling the constructor at the end.
        // Ignore the name of the first column, it's the wavelenght.
        const attrs = {};

        const spectra_names = csv[0].split(',').slice(1).map(x => x.trim());
        const n_spectra = spectra_names.length;
        const spectra = Array(n_spectra);
        for (let i = 0; i < n_spectra; i++)
            spectra[i] = [];

        let wavelengths = [];
        for (let line of csv) {
            let vals = line.split(',').map(x => parseFloat(x));
            wavelengths.push(vals[0]);
            for (let i = 0; i < n_spectra; i++)
                spectra[i].push(vals[1+i]);
        }

        for (let i = 0; i < n_spectra; i++) {
            attrs[spectra_names[i]] = new SpekCheck.Spectrum({
                wavelength: wavelengths,
                data: spectra[i],
            });
        }
        return attrs;
    },

    parseFile: function(text, header_map, constructor) {
        // Parse our spectra files (text header followed with CSV)
        //
        // Our spectra files have a multi-line text header of the
        // form:
        //
        //    key: some-value
        //
        // This header is followed by CSV like:
        //
        //    wavelengths, spectra name #1, spectra name #2
        //    x, y, z
        //
        // The `key` values are case-sensitive and used to index
        // `header_map`.  The `spectra name #N` will be used as a
        // property name in the constructor.  Everything is
        // case-sensitive.
        //
        // Args:
        //     text (String): the file content.
        //
        //     header_map (Object): maps header keys on the file
        //        header to property names used for the Object passed
        //        to `constructor`.  If the value is `null`, those
        //        keys are ignored.
        //
        //     constructor (function): the constructor used for the
        //         returned object.  It must accept an Object as
        //         input.  The keys of that Object will be the values
        //         of `header_map` and the CSV header names.
        //
        // Returns:
        //    An object constructed with `constructor`.
        //
        // This is meant to construct the Dye, Excitation, and Source
        // objects which have one or more Spectrum objects.  So if we
        // have a file like this:
        //
        //     Name: really cool dye
        //     Type: vegan-eco-bio-green dye
        //     Quantum Yield: 9001
        //     Extinction coefficient: 0.9
        //     wavelength, excitation, emission
        //     300.0, 0.5, 0.07
        //     ...
        //
        // The the function would be called like this:
        //
        //      parseFile(text, {
        //                        'Name': null, // Ignore this
        //                        'Type': null, // Ignore this
        //                        'Quantum Yield': 'q_yield',
        //                        'Extinction coefficient': 'ext_coeff'
        //                      },
        //                constructor)
        //
        // To have the constructor called like this (the names q_yield
        // and ext_coeff are values from header_map, while the names
        // excitation and emission come from the first line of the CSV
        // text):
        //
        //    constructor({
        //        q_yield: 9001,
        //        ext_coeff: 0.9,
        //        excitation: new Spectrum({
        //            wavelength: [300.0, ...],
        //            data: [0.5, ...],
        //        },
        //        emission: new Spectrum({
        //            wavelength: [300.0, ...],
        //            data: [0.0.7, ...],
        //        },
        //    });

        const attrs = {}; // to be used when calling constructor

        const lines = text.split('\n');
        const header_length = Object.keys(header_map).length;
        const header = lines.slice(0, header_length);
        const csv = lines.slice(header_length);

        const header_attrs = this.parseHeader(header, header_map);
        const csv_attrs = this.parseCSV(csv);
        if (Object.keys(header_attrs).some(x => csv_attrs.hasOwnProperty(x)))
            throw TypeError('csv and header have duplicate properties');

        Object.assign(attrs, header_attrs, csv_attrs);
        return new constructor(attrs);
    }
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

    header_map: {
        'Name': null,
        'Type': null,
    },

    parseFile: function(text) {
        return SpekCheck.Spectrum.parseFile(text,
                                            SpekCheck.Excitation.header_map,
                                            SpekCheck.Excitation);
    },
});


SpekCheck.Dye = Backbone.Model.extend({
    defaults: {
        name: '',
        excitation: new SpekCheck.Spectrum(),
        emission: new SpekCheck.Spectrum(),
        ext_coeff: 0.0,
        q_yield: 0.0,
    },

    validate: function(attrs, options) {
        if (! attrs.excitation.isValid)
            return attrs.excitation.validationError;
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

    header_map: {
        'Extinction coefficient': 'ext_coeff',
        'Quantum Yield': 'q_yield',
    },

    parseFile: function(text) {
        return SpekCheck.Spectrum.parseFile(text, SpekCheck.Dye.header_map,
                                            SpekCheck.Dye);
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

    events: {
        'change': "doFoo",
    },

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

    initialize: function(options) {
        this.plot = new Chart(this.el, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'transmitted',
                    data: [],
                    borderWidth: 1,
                    borderColor: 'rgba(0, 0, 0, 0.5)',
                    pointRadius: 0,
                }],
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
                        },
                    }],
                },
            },
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

SpekCheck.SetupView = Backbone.View.extend({
    tagName: 'section',

    initialize: function(options) {
        console.log('inilas');
        this.$sources = options.sources;
        this.$dyes = options.dyes;
        console.log(options);
    },
    // events: function() {
    //     const events = {};
    //     events['change #' + this.$sources.attr('id')] = 'doFoo';
    //     events['change #' + this.$dyes.attr('id')] = 'doDye';
    //     return events;
    // },

    doFoo: function(e) {
        console.log(e + 'Foo');
    },
    doDye: function(e) {
        console.log(e + 'dye');
    },
});

class SpekCheckView {
    constructor($el, dyes, sources) {
        this.$el = $el;
        this.setup = new SpekCheck.Setup;
        this.dyes = dyes;
        this.sources = sources;

    }
}

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

    // let plot = new SpekCheck.SetupPlot({
    //     el: $('#setup-plot')[0].getContext("2d"),
    //     setup: new SpekCheck.Setup,
    // });

    // let app = new SpekCheck.SetupView({
    //     el: $('#spekcheck'),
    //     'plot': plot,
    //     'dyes': dyes_view.$el,
    //     'sources': sources_view.$el,
    // });
    // new SpekCheck.View(...);
});

class Spectrum
{
    constructor(wavelength, data) {
        this.wavelength = wavelength;
        this.data = data;
    }

    toChartjsPoints() {
        // We are using Chart.js for the plotting which requires this
        // format.  Maybe this could be moved into the Plot class but
        // this allows us to keep this in cache (maybe this is not
        // good?)
        if (this._chartjs_points === undefined) {
            this._chartjs_points = [];
            for (let i = 0; i < this.wavelength.length; i++) {
                this._chartjs_points.push({
                    x: this.wavelength[i],
                    y: this.data[i],
                });
            }
        }
        return this._chartjs_points;
    }
}


// Delays actually reading the data until the properties are accessed.
class LazyData
{
    constructor(url, properties)
    {
        this.url = url;
        this.properties = properties;
        for (let property of properties)
            Object.defineProperty(this, property,
                                  {get: this.fill,
                                   configurable: true,})
    }

    fill()
    {
        for (let property of this.properties) {
            delete this[property];
            Object.defineProperty(this, property, {value: this.url})
        }
    }
}

class Foo8
{
    get bar() {
        console.log('getter');
        Object.defineProperty(this, 'bar', {value:100});
        return this.bar;
    }
    set bar(val) {
        console.log('jklasa');
    }
}

    
class Dye
{
    // constructor(name) {
    //     this.name = name;
    // }

    cached() {
        return false;
    }

}


class ChangeEventTrigger
{
    trigger() {
    }

    on(property, callback) {
        this.push(callback);
    }
}

class Setup
{
    constructor() {
        this.change_callbacks = [];
        this.dye = 'foo';
        this.ex_source = 'bar';
        this.ex_filters = [];
        this.em_filters = [];
    }

    // change dye
    // change source
    //
    // add ex source
    // rm ex source

    onChange(callback) {
        this.change_callbacks.push(callback);
    }

    triggerChange() {
        for (let callback of this.change_callbacks)
            callback();
    }

    static parseLine(line) {
        // Expects line to be a setup definition.  It's the
        // responsability of the caller to make sure that file
        // comments and empty lines are filtered out.
        const line_parts = line.split(',').map(x => x.trim());
        const name = line_parts[0];
        const dye = new Dye(line_parts[1]); // construct
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
    }
}

class Collection
{
    constructor(obj_type) {
        this.url = '../data/' + obj_type.url;
        this.obj_type = obj_type;
        this.objects = [];
    }

    fetch(over_options) {
        const collection = this;
        const defaults = {
            url: this.url,
            dataType: 'text',
            success: function(text) {
                const objects = collection.constructor.parseText(text);
                collection.reset(objects);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // We return an empty collection if we fail to get the
                // data.  Should we maybe raise an error?
                console.log(textStatus);
                console.log(errorThrown);
                collection.reset([]);
            },
        };
        const options = Object.assign({}, defaults, over_options);
        $.ajax(options);
    }

    reset(objects) {
        this.objects = objects;
        console.log('reset with ' + objects);
    }

    add(object) {
        this.objects.push(object);
        console.log('adding ' + object);
    }
}


// Collections for filters, dyes, and excitation sources.
//
// The url from where the data is fetched will be computed from the
// object type base url.

class DataCollection extends Collection
{
    fetch(over_options) {
        const collection = this;
        const defaults = {
            dataType: 'json',
            success: function(data) {
                const objects = collection.constructor.parseData(data);
                collection.reset(objects);
            }
        };
        const options = Object.assign({}, defaults, over_options);
        super.fetch(options);
    }

    static parseData(data) {
        for (let i = 0; i < data.length; i++)
            data[i] = {name: data[i]};
        return data;
    }
}


class DyeCollection extends DataCollection
{
    constructor(objects) {
        super(objects);
        this.url += 'dyes.json'
    }
}


class ExcitationCollection extends DataCollection
{
    constructor(objects) {
        super(objects);
        this.url += 'excitation.json';
    }
}


class FilterCollection extends DataCollection
{
    constructor(objects) {
        super(objects);
        this.url += 'filters.json';
    }
}

class SetupCollection extends Collection
{
    constructor(objects) {
        super(objects);
        this.url += 'sets';
    }

    static parseText(txt) {
        const setups = [];
        for (let line of txt.split('\n')) {
            line = line.trim();
            if (line.startsWith('//') || line.length === 0)
                continue; // skip comments and empty lines
            setups.push(Setup.parseLine(line));
        }
        return setups;
    }
}

class DataServer
{
    constructor(base_url) {
        this.base_url = base_url;
    }

    fetch(name) {
    }
}

class SetupPlot
{
    constructor($el, setup) {
        this.$el = $el;
        this.plot = new Chart(this.$el, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'transmitted',
                    data: [],
                    borderWidth: 1,
                    borderColor: 'rgba(0, 0, 0, 0.5)',
                    pointRadius: 0,
                }],
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
                        },
                    }],
                },
            },
        });
        // this.setup.on('change', this.add_spectrum);
        // this.listenTo(this.setup, 'change', this.render);
        // this.render();
    }

    render() {
        this.add_spectrum(this.setup.ex_source.spectrum);
        for (let ex_filters of this.setup.ex_filters)
            this.add_spectrum(ex_filters.spectrum);

        // For dye, we have two spectras...
        //        this.add_spectrum(this.setup.dye.spectrum);

        for (let em_filters of this.setup.em_filters)
            this.add_spectrum(em_filters.spectrum);
        this.plot.update();
    }

    add_spectrum(spectrum) {
        //const hue = this.constructor.wavelengthToHue(spectrum.peakwl());
        const points = [];
        for (let i = 0; i < spectrum.wavelength.length; i++)
            points.push({x: spectrum.wavelength[i], y: spectrum.data[i]});

        const dataset = {
            label: 'foo',
            data: spectrum.toChartjsPoints(),
            pointRadius: 0,
        };
        this.plot.data.datasets.push(dataset);
    }

    static dashes() {
        // LineDash styles to use on spectra plots.
        return [[8,4], [16,4], [4,8,4], [4,8,8]];
    }

    static wavelengthToHue(wl) {
        // Convert a wavelength to HSL-alpha string.
        return Math.max(0.0, Math.min(300, 650-wl)) * 0.96;
    }
}
