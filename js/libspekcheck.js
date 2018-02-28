// Copyright (C) 2017 Mick Phillips <mick.phillips@gmail.com>
// Copyright (C) 2017-2018 Ian Dobbie <ian.dobbie@bioch.ox.ac.uk>
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


// Base class to provide model validation and event callbacks.
//
// For validation, subclasses should overload the 'validate' method.
// Users should be calling 'isValid' and then accessing the
// 'validation_error' property for the error message.
//
// If it looks like we are re-inventing backbone with ES6 syntax,
// that's because we tried to use backbone first before giving up and
// picking only the things we needed.
class Model
{
    constructor() {
        this.validation_error = null; // String or null
        this._events = {};
    }

    isValid() {
        this.validation_error = this.validate() || null;
        return this.validation_error === null;
    }

    on(event, callback, thisArg=callback) {
        if (this._events[event] === undefined)
            this._events[event] = [];
        this._events[event].push(callback.bind(thisArg));
    }

    trigger(event, args) {
        if (this._events[event] !== undefined)
            for (let callback of this._events[event])
                callback.apply(null, args);
    }
}


// Call for Spectrum data and its computations.  Not for Dye, Filter,
// or Excitation.  Those have a spectrum property but they are not a
// Spectrum themselves.
class Spectrum extends Model
{
    constructor(wavelength, data) {
        super();
        this.wavelength = wavelength; // Array of floats
        this.data = data; // Array of floats
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
            area += 0.5 * (v[i] + v[i-1])*(w[i] - w[i-1]);
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
        //     header(Array): one item per text line.
        //     header_map(Object): see doc for parseFile.
        //
        // Returns:
        //     An Object of attributes, keys taken from 'header_map'
        //     values.
        const attrs = {};
        for (let line of header) {
            if (line.startsWith('#'))
                continue; // skip comments
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
                throw new Error(`missing value for '${ attr_name }' in header`);

        return attrs;
    }

    static parseCSV(csv) {
        // Args:
        //    csv(Array): one item per line.
        //
        // Returns:
        //    An Object with the spectrum names as keys, and Spectrum
        //    objects as values.
        //
        // First line of CSV content tells us: 1) the number of
        // columns/spectrum; 2) name to give to each spectrum.  We
        // ignore the name of the first column, but it should be
        // wavelength.
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

        // Data corrections:

        for (let i = 0; i < n_spectra; i++) {
            // Rescale to [0 1] if it looks like data is on percent.
            // If the data is in percentage but all values are below
            // 10%, it will not be rescaled.  This should not happen
            // because values in a spectrum are all relative to their
            // maximum value.  Except we also handle the sensitivity
            // of cameras detectors as Spectrum.  Here's to hope that
            // we never have to handle a detector with a maximum
            // sensitivity below 10%.
            const data = spectra[i];
            if (data.some(x => x > 10.0))
                for (let j = 0; j < data.length; j++)
                    data[j] /= 100;

            // Clip negative values to zero
            for (let j = 0; j < data.length; j++)
                if (data[j] < 0)
                    data[j] = 0;
        }

        for (let i = 0; i < n_spectra; i++)
            attrs[spectra_names[i]] = new Spectrum(wavelengths, spectra[i]);

        return attrs;
    }

    static parseText(text, header_map, factory) {
        // Parse our spectra files (text header followed with CSV)
        //
        // Our spectra files have a multi-line text header of the
        // form:
        //
        //    key: some-value
        //    # An optional comment
        //
        // This header is followed by CSV like:
        //
        //    wavelengths, spectra name #1, spectra name #2
        //    x, y, z
        //
        // The 'key' values are case-sensitive and used to index
        // 'header_map'.  The 'spectra name #N' will be used as a
        // property keys on the Object passed to 'factory'.
        // Everything is case-sensitive.
        //
        // Args:
        //     text (String): the file content.
        //
        //     header_map (Object): maps header keys from the file
        //        header to property names used for the Object passed
        //        to 'factory'.  If the value is 'null', those keys
        //        are ignored.
        //
        //     factory (function): the function for the returned
        //         object.  It must accept an Object as input.  The
        //         keys of that Object will be the values of
        //         'header_map' and the CSV spectrum names.
        //
        // Returns:
        //    The return value from 'factory'.
        //
        // This is meant to construct the Dye, Excitation, Filter, and
        // Source objects which have one or more Spectrum objects.  So
        // if we have a file like this:
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
        //      parseText(text,
        //                {
        //                    'Name': null, // Ignore this
        //                    'Type': null, // Ignore this
        //                    'Quantum Yield': 'q_yield',
        //                    'Extinction coefficient': 'ext_coeff'
        //                },
        //                (attrs) => new Dye(attrs))
        //
        // To have 'factory' called like this (the names 'q_yield' and
        // 'ext_coeff' are values from 'header_map', while the names
        // 'excitation' and 'emission' come from the first line of the
        // CSV text):
        //
        //    factory({
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

        const attrs = {}; // to be used when calling factory

        const lines = text.split('\n');

        // We want to support an arbitrary number of comment lines on
        // the file header so we also add lines starting with # to the
        // header length (which the header parser will ignore).
        let header_length = Object.keys(header_map).length;
        for (let i = 0; i < header_length +1; i++)
            if (lines[i].startsWith('#'))
                header_length++;

        const header = lines.slice(0, header_length);
        const csv = lines.slice(header_length);

        const header_attrs = this.parseHeader(header, header_map);
        const csv_attrs = this.parseCSV(csv);
        if (Object.keys(header_attrs).some(x => csv_attrs.hasOwnProperty(x)))
            throw new Error('csv and header have duplicate properties');

        Object.assign(attrs, header_attrs, csv_attrs);
        return factory(attrs);
    }
}


// Base class for our Data, Excitation, and Filter classes.
//
// It provides a nice default constructor and factory from file text.
// It requires two static data members wich configure the constructor
// and the reader:
//
//    properties: an Array of property names which will be defined on
//        a class instance, and are required to be keys on the Object
//        passed to the factory.
//    header_map: used to map the keys on the header of the files to
//        the keys used on the Object passed to the factory.  null
//        values mean fields to ignore.
//
// TODO: call it something other than Data.  It is meant to represent
//       the things that we have a data file for.
class Data extends Model
{
    constructor(attrs) {
        super();
        // Make sure that all properties are defined.
        for (let p of this.constructor.prototype.properties) {
            if (attrs[p] === undefined)
                throw new Error(`missing property '${ p }'`);
            this[p] = attrs[p];
        }
    }

    static constructFromText(text) {
        const factory = (attrs) => new this.prototype.constructor(attrs);
        return Spectrum.parseText(text, this.prototype.header_map, factory);
    }
}
Data.prototype.header_map = {
    'Name' : null,
    'Type' : null,
};


class Dye extends Data
{
    validate() {
        for (let s_name of ['emission', 'excitation']) {
            if (! this[s_name] instanceof Spectrum)
                return `${ s_name } property is not a Spectrum object`;
            if (! this[s_name].isValid())
                return this[s_name].validation_error;
        }

        // Careful with the comparison logic here.  We compare for
        // true so that it also checks for the right type.  If we did
        // 'ex_coeff < 0.0' it would return false even if 'ex_coeff'
        // was undefined a String or whatever.
        if (! (this.ex_coeff >= 0.0) && ! isNaN(this.ex_coeff))
            return 'Extinction Coefficient must be a positive number';
        if (! (this.q_yield >= 0.0) && ! isNaN(this.q_yield))
            return 'Quantum Yield must be a positive number';
    }
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
    validate() {
        if (! this.intensity instanceof Spectrum)
            return "'intensity' property is not a Spectrum object";
        if (! this.intensity.isValid())
            return this.intensity.validation_error;
    }
}
Excitation.prototype.properties = [
    'intensity',
];


// Reflection/Transmission mode is not a property of the filter, it's
// a property of the Optical Setup.  So it's up to Setup to handle it.
class Filter extends Data
{
    get reflection() {
        // Lazy-getters to compute reflection.
        const reflection = this.transmission.map(x => 1-x);
        delete this.reflection;
        Object.defineProperty(this, 'reflection', {value: reflection});
        return this.reflection;
    }

    set reflection(val) {
        // We just declare this because we need to declare a setter
        // with everty getter.
        Object.defineProperty(this, 'reflection', {value: val});
    }

    validate() {
        if (! this.transmission instanceof Spectrum)
            return "'transmission' property is not a Spectrum object";
        if (! this.transmission.isValid())
            return this.transmission.validation_error;
    }
}
Filter.prototype.properties = [
    'transmission',
];


class FilterSet extends Model
{
    constructor() {
        super();
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

    // changeMode() {
    //     this.mode = this.mode === 't' ? 'r' : 't';
    // }

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

    static constructFromText(text) {
        // Some Filter data files have reflection instead of
        // transmission so fix that before calling the constructor.
        const constructor = this.prototype.constructor;
        const factory = function(attrs) {
            if (attrs.reflection !== undefined) {
                attrs.transmission = attrs.reflection;
                attrs.transmission.data = attrs.reflection.data.map(x => 1-x);
                delete attrs.reflection;
            }
            return new constructor(attrs);
        }
        return Spectrum.parseText(text, this.prototype.header_map, factory);
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

    static parseSetupsFile(txt) {
        let setups = [];
        for (let line of txt.split('\n')) {
            line = line.trim();
            if (line.startsWith('//') || line.length === 0)
                continue; // skip comments and empty lines
            let setup = SpekCheck.Setup.parseSetupLine(line);
            setups.push(setup);
        }
        return setups;
    }
}


// A simple container of properties emitting triggers when they
// change.  This is the model for what will eventually get displayed.
// All user interactions get modelled into changes to an OpticalSetup
// instance.
class OpticalSetup extends Model
{
    constructor() {
        super();
        // Adds a setter and getter for all properties, so it triggers
        // change events.
        const defaults = {
            dye: null,
            excitation: null,
            // The filters are a Map with Filter objects as keys, and
            // mode as value.  mode is a single char, 'r' or 't', for
            // reflection or transmission.
            ex_filters: {},
            em_filters: {},
        };
        for (let p_name of Object.keys(defaults)) {
            const attr_name = `_${ p_name }`;
            Object.defineProperty(this, attr_name, {
                value: defaults[p_name],
                writable: true,
            });
            Object.defineProperty(this, p_name, {
                get: function () {
                    return this[attr_name];
                },
                set: function (val) {
                    this[attr_name] = val;
                    this.trigger('change');
                },
            });
        }
    }
}


// Our base class for Collections.
//
// A lot of functionality here is asynchronous because the actual
// Models it stores will only be created when it's required to access
// them (so that the data files are only parsed when required).
class Collection extends Model
{
    constructor() {
        super();
        this.url = '../data/';
        this.models = []; // Actually, promises of a model.
        this.uids = []; // Array of Strings (the names which are unique)

        // This callbacks are usually arrays.  We can probably get
        // away with only one callback.
        //
        // TODO: add this event handling to the Model parent class.
        this.add_callback = undefined;
        this.reset_callback = undefined;
    }

    validate() {
        if (this.models.length !== this.uids.length)
            return 'Number of models and uids is not the same';
        if (this.models.some(x => x !== undefined && ! x instanceof Promise))
            return 'Models must all be promises (or undefined)';
    }

    add(uid, model) {
        if (this.uids.indexOf(uid) !== -1)
            throw new Error(`There is already '${ uid }' in collection`);
        if (! model instanceof Promise)
            throw new Error('New model being added is not a Promise');

        this.models.push(model);
        this.uids.push(uid);
        if (this.add_callback !== undefined)
            this.add_callback(object);
    }

    get(uid) {
        // Returns a Promise!!!
        const index = this.uids.indexOf(uid);
        if (index === -1)
            throw new Error(`No object named '${ uid }' in collection`);
        if (this.models[index] === undefined)
            this.models[index] = this.fetch_model(uid);
        return this.models[index];
    }

    fetch(new_options) {
        // Async method!!!
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

    reset(uids) {
        this.uids = uids.slice(0);
        // XXX: maybe we should fill the models with promises?
        this.models = new Array(this.uids.length);
        if (this.reset_callback !== undefined)
            this.reset_callback();
    }

}


// Collections for filters, dyes, and excitation sources.
class DataCollection extends Collection
{
    constructor(filename, factory) {
        // Args:
        //    filename (String):
        //    factory (function): will parse the text of a file and
        //        return a Data object.  See Data.constructFromText.
        super();
        this.dir_url = this.url + filename + '/';
        this.url += filename + '.json';
        this.factory = factory;
    }

    fetch_model(uid) {
        const fpath = this.dir_url + uid + '.csv';
        return $.ajax({
            url: fpath,
            dataType: 'text',
        }).then(text => this.factory(text));
    }
}


class SetupCollection extends Collection
{
    constructor(filename) {
        super();
        this.url += filename; // plain text file, no file extension
    }

    fetch() {
        super.fetch({dataType: 'text'});
    }

    resetWithData(data) {
        const uids = this.constructor.parseData(data);
        this.reset(uids);
    }

    static parseData(data) {
        const setups = [];
        for (let line of data.split('\n')) {
            line = line.trim();
            if (line.startsWith('//') || line.length === 0)
                continue; // skip comments and empty lines
            setups.push(OpticalSetup.parseLine(line));
        }
        // gag until we figure out how to handle models
        const setup_ids = setups.map(x => x.name);
        return setup_ids;
    }
}


class SelectorView
{
    constructor($el, collection) {
        this.$el = $el;
        this.collection = collection;
        this.collection.reset_callback = this.render.bind(this);
    }

    render() {
        const names = [''].concat(this.collection.uids);
        const html = names.map(name => this.option_html(name));
        this.$el.html(html);
    }

    option_html(name) {
        return `<option value="${ name }">${ name }</option>\n`;
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
        const html = this.collection.uids.map(name => this.option_html(name));
        this.$el.html(html);
    }

    option_html(name) {
        return `<option value="${ name }">${ name }</option>\n`;
    }
}

class FilterSetBuilder
{
    constructor($el, filters) {
        this.$el = $el;
        this.filters = filters;
        this.ex_filters = [];
        this.em_filters = []

        this.$ex_el = undefined;
        this.$em_el = undefined;
    }

    onAdd(ev) {
        // Adding a filter to either the ex or em path
    }
    onRemove(ev) {
    }
}



class OpticalSetupPlot
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
        this.setup.on('change', this.render, this);

        // Keep a cache of individual Spectrum objects, as ready to
        // use Chartjs datasets.
        this._dataset_cache = new WeakMap;
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

    render() {
        const datasets = [];

        if (this.setup.excitation !== null) {
            const spectrum = this.setup.excitation.intensity;
            datasets.push(this.asChartjsDataset(spectrum, 'Excitation'));
        }

        if (this.setup.dye !== null) {
            const dye = this.setup.dye;
            datasets.push(this.asChartjsDataset(dye.excitation,
                                                'Dye Excitation'));
            datasets.push(this.asChartjsDataset(dye.emission,
                                                'Dye Emission'));
        }

        for (let spectrum of this.setup.ex_filters)
            datasets.push(this.asChartjsDataset(spectrum), 'foo');
        for (let spectrum of this.setup.em_filters)
            datasets.push(this.asChartjsDataset(spectrum), 'foo');

        if (this.setup.excitation !== null &&
            this.setup.ex_filters.length !== 0) {
            // adjust excitation to filters
        }

        if (this.setup.em_filters.length !== 0) {
            // compute transmission
        }

        this.plot.data.datasets = datasets;
        this.plot.update();
    }

    static dashes() {
        // LineDash styles to use on spectrum lines of filters only.
        return [[8,4], [16,4], [4,8,4], [4,8,8]];
    }
}


class SpekCheckController
{
    constructor() {
        this.setup = new OpticalSetup;
        this.plot = new OpticalSetupPlot($('#setup-plot')[0].getContext('2d'),
                                         this.setup);

        const dye_reader = Dye.constructFromText.bind(Dye);
        this.dyes = new DataCollection('dyes', dye_reader);
        this.dyes_view = new SelectorView($('#dye-selector'),
                                          this.dyes);

        const excitation_reader = Excitation.constructFromText.bind(Excitation);
        this.excitations = new DataCollection('excitation', excitation_reader);
        this.excitations_view = new SelectorView($('#source-selector'),
                                                 this.excitations);

        const filter_reader = Filter.constructFromText.bind(Filter);
        this.filters = new DataCollection('filters', filter_reader);
        this.filters_view = new CollectionView($('#filters-view'),
                                               this.filters);
        this.filters_view.option_html = function(name) {
            return '<li class="list-group-item">' +
                  `${ name }` +
                '<button type="button" class="close" aria-label="Add to excitation">' +
                '<span aria-hidden="true">&#8668;</span>' +
                '</button>' +
                '<button type="button" class="close" aria-label="Add to emission">' +
                '<span aria-hidden="true">&#8669;</span>' +
                '</button>' +
                '</li>';
        }

        // this.setups = new SetupCollection('sets');
        // this.setups_view = new CollectionView($('#setup-selector'),
        //                                        this.setups);

        for (let x of [this.dyes, this.excitations, this.filters])
            x.fetch();

        this.excitations_view.$el.on('change',
                                     this.changeExcitation.bind(this));
        this.dyes_view.$el.on('change',
                              this.changeDye.bind(this));

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

        $('.custom-file-input').on('change', this.selectFile);
        $('#import-dye').on('click', this.addDye.bind(this));
    }

    selectFile(ev) {
        const filename = ev.target.files[0].name;
        const label = $(ev.target).next('.custom-file-label');
        label.html(filename);
    }

    addDye(ev) {
        const file = $('#file-selector')[0].files[0];
        // We should probably be using a FileReader...
        const file_url = window.URL.createObjectURL(file);
        return $.ajax({
            url: file_url,
            dataType: 'text',
        }).then(text => this.dyes.add(this.dyes.factory(text)));
    }

    changeDye(ev) {
        const uid = ev.target.value;
        if (uid === '') {
            this.user_selected_dye = false;
            this.setup.dye = undefined;
        } else {
            this.user_selected_dye = true;
            this.dyes.get(uid).then(
                dye => {this.setup.dye = dye}
            );
        }
    }

    changeExcitation(ev) {
        const uid = ev.target.value;
        if (uid === '') {
            this.user_selected_excitation = false;
            this.setup.excitation = undefined;
        } else {
            this.user_selected_excitation = true;
            this.excitations.get(uid).then(
                ex => {this.setup.excitation = ex}
            );
        }
    }

    // changeFilter(ev) {
    //     const uid = ev.target.value;
    //     if (uid === '') {
    //         this.setup.excitation = undefined;
    //     } else {
    //         this.user_selected_excitation = true;
    //         this.filters.get(uid).then(
    //             ex => {this.setup.excitation = ex}
    //         );
    //     }
    // }
}

$(document).ready(function() {
    const spekcheck = new SpekCheckController;
});
