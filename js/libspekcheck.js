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


SpekCheck.Setup = Backbone.Model.extend({
    defaults: {
        name: '',
        // dye: new SpekCheck.Dye,
        // ex_source: new SpekCheck.Excitation,
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
        // const dye = new SpekCheck.Dye({name: line_parts[1]});
        // const ex_source = new SpekCheck.Excitation({
        //     'name': line_parts[2],
        // });

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
        // const setup = new SpekCheck.Setup({
        //     'name': name,
        //     'dye': dye,
        //     'ex_source': ex_source,
        //     'ex_filters': ex_filters,
        //     'em_filters': em_filters,
        // });
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

class Model
{
    constructor() {
        this.validation_error = undefined;
    }

    isValid() {
        this.validation_error = this.validate();
        return this.validation_error === undefined;
    }
}


class Spectrum extends Model
{
    constructor(wavelength, data) {
        super();
        this.wavelength = wavelength;
        this.data = data;
    }

    validate() {
        if (! this.wavelength instanceof Array)
            return "No 'wavelength' property for spectrum";
        if (! this.data instanceof Array)
            return "No 'data' property for spectrum";
        if (this.wavelength.length !== this.data.length)
            return "'data' and 'wavelength' arrays must have the same length";
    }

    area() {
        // Return the area of the spectrum.
        // Clamps negative values to zero.
        var w;
        var v;
        [w,v] = this.interpolate();
        const area = 0.0;
        for (let i=1; i < w.length; i++)
            area += 0.5 * (Math.max(0, v[i]) + Math.max(0, v[i-1]))*(w[i] - w[i-1]);
        return area;
    }

    interpolate() {
        return undefined;
    }

    multiplyBy(other) {
        // multiplies this spectrum by other
        // invalidates previously calculated _points
        this._points = null;
        this.interpolate();
        var oldMax = Math.max(...this._interp[1]);
        if (other instanceof Spectrum) {
            var m = other.interpolate()[1];
            for (var i = 0; i < this._interp[1].length; i ++)
                this._interp[1][i] *= m[i];
        } else if (Array.isArray(other)) {
            for (var i = 0; i < this._interp[1].length; i ++)
                this._interp[1][i] *= other[i];
        } else {
            for (var i = 0; i < this._interp[1].length; i ++)
                this._interp[1][i] *= other;
        }
    }

    peakWavelength() {
        // We could keep the value in cache but this is actually only
        // used to create the dataset for Chartjs and SetupPlot
        // already keeps the values in cache.
        const max_index= this.data.reduce(
            (iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0
        );
        return this.wavelength[max_index];
    }

    static parseHeader(header, header_map) {
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
                    const val = parseFloat(line.slice(header_key.length+2));

                    // Even though we only expect numeric input,
                    // sometimes, the values are missing, e.g., we
                    // don't have quantum yield for all dyes.  In that
                    // case, the value will be a NaN.

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
    }

    static parseCSV(csv) {
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

        const wavelengths = [];
        for (let line of csv.slice(1)) {
            let vals = line.split(',').map(x => parseFloat(x));
            wavelengths.push(vals[0]);
            for (let i = 0; i < n_spectra; i++)
                spectra[i].push(vals[1+i]);
        }

        for (let i = 0; i < n_spectra; i++) {
            // Rescale to [0 1] if it looks like data is on percent
            const data = spectra[i];
            if (data.some(x => x > 10.0))
                for (let j = 0; j < data.length; j++)
                    data[j] /= 100;
        }

        for (let i = 0; i < n_spectra; i++)
            attrs[spectra_names[i]] = new Spectrum(wavelengths, spectra[i]);

        return attrs;
    }

    static parseFile(text, header_map, constructor) {
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
}


// Base class for our Data, Excitation, and Filter classes.
//
// It requires two static data members:
//
//    properties: an Array of property names which will be defined on
//        a class instance, and are required to be keys on the Object
//        passed to the constructor.
//    header_map: used to map the keys on the header of Spectra files
//        to the keys used on the Object passed to the constructor.
//        null values mean fields to ignore.
class Data
{
    constructor(attrs) {
        // Make sure that all properties mentioned are defined
        for (let p of this.constructor.prototype.properties) {
            if (attrs[p] === undefined)
                throw TypeError('missing property');
            this[p] = attrs[p];
        }
    }

    static constructFromFile(text) {
        return Spectrum.parseFile(text, this.prototype.header_map,
                                  this.prototype.constructor);
    }
}
Data.prototype.header_map = {
    'Name' : null,
    'Type' : null,
};


class Dye extends Data
{
}
Dye.prototype.header_map = Object.assign({}, Data.prototype.header_map, {
    'Extinction coefficient': 'ex_coeff',
    'Quantum Yield': 'q_yield',
});
Dye.prototype.properties = [
    'emission',
    'ex_coeff',
    'excitation',
    'q_yield',
];


class Excitation extends Data
{
}
Excitation.prototype.properties = [
    'intensity',
];


class Filter extends Data
{
    constructor(name, transmission, mode) {
        this.name = name;
        this.transmission = transmission;
        this.mode = mode;
    }

    validate() {
        if (! this.transmission.isValid)
            return this.transmission.validationError;
        if (this.mode !== 'r' && this.mode !== 't')
            return 'invalid filter mode';
    }

    changeMode() {
        this.mode = this.mode === 't' ? 'r' : 't';
    }

    static parseFilterField(field) {
        // Parses a filter definition as it appears on the sets file,
        // i.e., 'filter_name [mode]' where mode is optional and R|T
        const field_parts = field.split(' ').map(x => x.trim());
        if (field_parts.length > 2)
            throw TypeError('invalid Filter definition ' + field);

        const attrs = {name: field_parts[0]};
        if (field_parts.length === 2)
            attrs.mode = field_parts[1].toLowerCase();
        return new Filter(attrs);
    }
}

class FilterSet
{
    constructor() {
        // this.dye = 'foo';
        // this.ex_source = 'bar';
        this.ex_filters = [];
        this.em_filters = [];
        this.preferred_dye = undefined;
        this.preferred_excitation = undefined;
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
        // const dye = new Dye(line_parts[1]); // construct
        // const ex_source = new SpekCheck.Excitation({
        //     'name': line_parts[2],
        // });

        // const ex_filters = [];
        // const em_filters = [];
        // let ex_path = true; // looking at filters in ex path until we see '::'
        // for (let filt of line_parts.slice(3)) {
        //     const c_idx = filt.search('::');
        //     if (c_idx >= 0) {
        //         if (! ex_path)
        //             throw TypeError('more than one :: in set ' + name);
        //         ex_filters.push
        //         ex_path = false;
        //         em_filters.push
        //     }
        //     else if (ex_path)
        //         ex_filters.push
        //     else // already looking at emission path
        //         em_filters.push
        // }
        // const setup = new SpekCheck.Setup({
        //     'name': name,
        //     'dye': dye,
        //     'ex_source': ex_source,
        //     'ex_filters': ex_filters,
        //     'em_filters': em_filters,
        // });
        // return setup;
        return new Setup(name);
    }
}


// Our base class for Collections.
class Collection
{
    constructor() {
        this.url = '../data/';
        this.models = []; // Actually, promises of a model.
        this.ids = [];

        // This callbacks are usually arrays.  We can probably get
        // away with only one callback.
        this.add_callback = undefined;
        this.reset_callback = undefined;
    }

    get(id) {
        // Returns a Promise!!!
        const index = this.ids.indexOf(id);
        if (index === -1)
            throw TypeError('no id');
       if (this.models[index] === undefined)
            this.models[index] = this.fetch_model(id);
        return this.models[index];
    }

    fetch(new_options) {
        const defaults = {
            url: this.url,
            dataType: 'json',
        };
        const options = Object.assign({}, defaults, new_options);
        // In case of error reading the collection file we set an
        // empty collection.  Maybe we should throw something?
        return $.ajax(options).then(data => this.resetWithData(data),
                                    () => this.reset([]));
    }

    resetWithData(data) {
        // By default, data should be a JSON array with IDs, so we can
        // just pass through to reset().  It's only the FilterSet
        // collection that are a bit more weird.
        this.reset(data);
    }

    reset(ids) {
        this.ids = ids.slice(0);
        this.models = new Array(this.ids.length);
        if (this.reset_callback !== undefined)
            this.reset_callback();
    }

    add(object) {
        this.models.push(object);
        if (this.add_callback !== undefined)
            this.add_callback(object);
    }
}


// Collections for filters, dyes, and excitation sources.
class DataCollection extends Collection
{
    constructor(filename, file_reader) {
        super();
        this.dir_url = this.url + filename + '/';
        this.url += filename + '.json';
        this.file_reader = file_reader;
    }

    fetch_model(id) {
        const fpath = this.dir_url + id + '.csv';
        return $.ajax({
            url: fpath,
            dataType: 'text',
        }).then(text => this.file_reader(text));
    }
}


class SetupCollection extends Collection
{
    constructor(filename) {
        super();
        this.url += filename; // it's a plain text file
    }

    fetch() {
        super.fetch({dataType: 'text'});
    }

    resetWithData(data) {
        const ids = this.constructor.parseData(data);
        this.reset(ids);
    }

    static parseData(data) {
        const setups = [];
        for (let line of data.split('\n')) {
            line = line.trim();
            if (line.startsWith('//') || line.length === 0)
                continue; // skip comments and empty lines
            setups.push(Setup.parseLine(line));
        }
        // gag until we figure out how to handle models
        const setup_ids = setups.map(x => x.name);
        return setup_ids;
    }
}


class CollectionView
{
    constructor($el, collection) {
        this.$el = $el;
        this.collection = collection;
        this.collection.reset_callback = this.render.bind(this);
    }

    render() {
        const names = [''].concat(this.collection.ids);
        const html = names.map(name => this.option_html(name));
        this.$el.html(html);
    }

    option_html(name) {
        return `<option value="${ name }">${ name }</option>\n`;
    }
}


class Setup
{
    constructor() {
        this._dye = undefined;
        this._excitation = undefined;
        this._em_filters = [];
        this._ex_filters = [];

        // This callbacks are usually arrays.  We can probably get
        // away with only one callback.
        this.change_callback = undefined;
    }

    set dye(val) {
        this._dye = val;
        this.change_callback();
    }
    get dye() {
        return this._dye;
    }

    set excitation(val) {
        this._excitation = val;
        this.change_callback();
    }
    get excitation() {
        return this._excitation;
    }
}

class SetupPlot
{
    constructor($el, setup) {
        this.$el = $el;
        this.setup = setup;
        this.plot = new Chart(this.$el, {
            type: 'scatter',
            data: {
                datasets: [],
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
                        ticks: {
                            suggestedMin: 380,
                            suggestedMax: 780,
                        },
                    }],
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                            min: 0,
                            max: 1,
                        },
                    }],
                },
            },
        });
        // this.setup.on('change', this.render.bind(this));
        // this.render();

        // Keep a cache of individual Spectrum objects, as ready to
        // use Chartjs datasets.
        this._dataset_cache = new WeakMap;
    }

    render() {
        const datasets = [];
        const setup = this.setup;

        if (this.setup.excitation !== undefined) {
            const spectrum = this.setup.excitation.intensity;
            datasets.push(this.asChartjsDataset(spectrum, 'Excitation'));
        }

        if (this.setup.dye !== undefined) {
            const dye = this.setup.dye;
            datasets.push(this.asChartjsDataset(dye.excitation,
                                                'Dye Excitation'));
            datasets.push(this.asChartjsDataset(dye.emission,
                                                'Dye Emission'));
        }
        // if (this.setup.dye !== undefined)
        //     plot_dye_spectrum()
        // this.add_spectrum(this.setup.ex_source.spectrum);
        // for (let ex_filters of this.setup.ex_filters)
        //     this.add_spectrum(ex_filters.spectrum);

            //             datasets: [{
            //         label: 'transmitted',
            //         data: [],
            //         borderWidth: 1,
            //         borderColor: 'rgba(0, 0, 0, 0.5)',
            //         pointRadius: 0,
            //     }],
            // },

        // For dye, we have two spectras...
        //        this.add_spectrum(this.setup.dye.spectrum);

        // for (let em_filters of this.setup.em_filters)
        //     this.add_spectrum(em_filters.spectrum);
        this.plot.data.datasets = datasets;
        this.plot.update();
    }

    static dashes() {
        // LineDash styles to use on spectra plots.
        return [[8,4], [16,4], [4,8,4], [4,8,8]];
    }

    asChartjsDataset(spectrum, label) {
        if (! this._dataset_cache.has(spectrum)) {
            const points = new Array(spectrum.wavelength.length);
            for (let i = 0; i < points.length; i++)
                points[i] = {x: spectrum.wavelength[i], y: spectrum.data[i]};
            // Convert a wavelength to HSL-alpha string.
            const peak_wl = spectrum.peakWavelength();
            const hue = Math.max(0.0, Math.min(300, 650-peak_wl)) * 0.96;

            const bg_colour = `hsla(${ hue }, 100%, 50%, 0.2)`;
            const fg_colour = `hsla(${ hue }, 100%, 50%, 1)`;
            const chartjs_dataset = {
                label: label,
                data: points,
                backgroundColor: bg_colour,
                borderColor: fg_colour,
                pointRadius: 0,
            };
            this._dataset_cache.set(spectrum, chartjs_dataset);
        }
        return this._dataset_cache.get(spectrum);
    }
}


class SpekCheckController
{
    constructor() {
        this.setup = new Setup;
        this.plot = new SetupPlot($('#setup-plot')[0].getContext('2d'),
                                  this.setup);

        const dye_reader = Dye.constructFromFile.bind(Dye);
        this.dyes = new DataCollection('dyes', dye_reader);
        this.dyes_view = new CollectionView($('#dye-selector'),
                                             this.dyes);

        const excitation_reader = Excitation.constructFromFile.bind(Excitation);
        this.excitations = new DataCollection('excitation', excitation_reader);
        this.excitations_view = new CollectionView($('#source-selector'),
                                                    this.excitations);

        // this.setups = new SetupCollection('sets');
        // this.setups_view = new CollectionView($('#setup-selector'),
        //                                        this.setups);

        for (let x of [this.dyes, this.excitations])
            x.fetch();

        this.excitations_view.$el.on('change',
                                     this.changeExcitation.bind(this));
        this.dyes_view.$el.on('change',
                              this.changeDye.bind(this));

        this.setup.change_callback = this.plot.render.bind(this.plot);
        // FilterSets have a preferred Dye and Excitation, the logic
        // being that they are often used with those.  In that case we
        // should change Dye and Excitation when changing FilterSet.
        // However, a user can also be interested in inspecting
        // different FilterSets for a specific Dye and Excitation in
        // which case they should remain fixed when changing
        // FilterSet.
        //
        // To support both cases, we keep track whether the current
        // Dye and Excitation selection comes from manual choice, and
        // only change them to a FilterSet prefered if not.
        this.user_selected_dye = false;
        this.user_selected_excitation = false;
    }

    changeDye(ev) {
        const id = ev.target.value;
        if (id === '') {
            this.user_selected_dye = false;
            this.setup.dye = undefined;
            console.log('nothing');
        } else {
            this.user_selected_dye = true;
            this.dyes.get(id).then(
                dye => {this.setup.dye = dye}
            );
        }
    }

    changeExcitation(ev) {
        const id = ev.target.value;
        if (id === '') {
            this.user_selected_excitation = false;
            this.setup.excitation = undefined;
            console.log('nothing');
        } else {
            this.user_selected_excitation = true;
            this.excitations.get(id).then(
                ex => {this.setup.excitation = ex}
            );
        }
    }
}

$(document).ready(function() {
    const spekcheck = new SpekCheckController;
});
