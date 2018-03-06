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
        this._events = {}; // {event_name: [callback1, callback2, ...]}
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
                // First argument is null because we already bound a
                // thisArg when we created the callback.
                callback.apply(null, args);
    }
}


// Class for Spectrum data and its computations.  Not for Dye, Filter,
// or Excitation.  Those have a Spectrum property but they are not a
// Spectrum themselves.
class Spectrum extends Model
{
    constructor(wavelength, data) {
        super();
        this.wavelength = wavelength.slice(0); // Array of floats
        this.data = data.slice(0); // Array of floats

        // Data corrections:

        // Rescale to [0 1] if it looks like data is on percent.  If
        // the data is in percentage but all values are below 10%, it
        // will not be rescaled.  This should not happen because
        // values in a spectrum are all relative to their maximum
        // value.  Except we also handle the sensitivity of cameras
        // detectors as Spectrum.  Here's to hope that we never have
        // to handle a detector with a maximum sensitivity below 10%.
        if (this.data.some(x => x > 10.0))
            for (let i = 0; i < this.data.length; i++)
                this.data[i] /= 100.0;

        // Clip values to [0 1]
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] < 0.0)
                this.data[i] = 0.0;
            if (this.data[i] > 1.0)
                this.data[i] = 1.0;
        }
    }

    validate() {
        if (! (this.wavelength instanceof Array))
            return "No 'wavelength' property for spectrum";
        if (! (this.data instanceof Array))
            return "No 'data' property for spectrum";
        if (this.wavelength.length !== this.data.length)
            return "'data' and 'wavelength' arrays must have the same length";
        if (this.data.some(x => x < 0.0 || x > 1.0))
            return "all 'data' must be in the [0 1] interval";
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

    interpolate(points) {
        // TODO: needs testing
        //
        // Interpolate data to specific wavelengths.
        //
        // Args:
        //     points(Array<float>): should sort in increasing order.
        //
        // Returns:
        //     A new Spectrum object.
        if (! (points instanceof Array))
            throw new TypeError('POINTS must be an Array');
        if (this.wavelength.length === 1)
            return new Spectrum(points.slice(0),
                                new Array(points.length).fill(0));

        const old_w = this.wavelength;
        const old_d = this.data;

        const new_w = points.slice(0);
        const new_d = new Array(wl.length);

        let i = 0; // index into the interpolated data

        // Outside the existing data, values are zero
        for (; new_w[i] < old_w[0]; i++)
            new_d[i] = 0;

        // We loop this way under the assumption that the existing
        // data has more points, and the purpose of this interpolation
        // is to resample at a much lower resolution (see Lumencor and
        // halogen excitation sources, and the DV-SSI filters which
        // have >3000 data points).
        let next_wl = new_w[i];
        const last_wl = new_w[new_w.length -1];
        let j = 0; // index into the original data

        const last_wavelength = old_w[old_w.length -1];
        for (; new_w[i] < last_wavelength && i < new_w.length; i++) {
            while (new_w[j] < new_w[i])
                j++;

            // This case should be quite common since most data is actually

            measurements
            // (original data) are often done at integer values, and
            // the sampling is done at integers wavelengths too.
            if (old_w[j] === new_w[i])
                new_d[i] = old_w[j];
            else {
                // Linear interpolation.
                const slope = (old_d[j] - old_d[j-1]) / (old_w[j] - old_w[j-1]);
                new_d[i] = old_d[j-1] + slope * (new_w[i] - old_w[j-1]);
            }
        }

        // Outside the existing data, values are zero
        for (; i < new_w.length; i++)
            new_d[i] = 0;

        return new Spectrum(new_w, new_d);
    }

    multiplyBy(other) {
        // Multiply by another spectrum instance and returns a new
        // Spectrum instance.  The wavelength range of the new
        // Spectrum is the intersection of the two wavelength ranges
        // (values outside the range are interpreted as zeros anyway).
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
        // We could keep the computed value in cache for next time.
        // However, this is only used by OpticalSetupPlot which
        // already keeps a cache of his own.
        const max_index= this.data.reduce(
            (iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0
        );
        return this.wavelength[max_index];
    }

    static
    parseHeader(header, header_map) {
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

    static
    parseCSV(csv) {
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

        for (let i = 0; i < n_spectra; i++)
            attrs[spectra_names[i]] = new Spectrum(wavelengths, spectra[i]);

        return attrs;
    }

    static
    parseText(text, header_map, factory) {
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

    // A Factory.
    //
    // Args:
    //     text: the file content for data of the returned type.
    //     given_args: Object which will be merged with the values
    //         read in 'text'.  Used by Collection to inject the
    //         name into the attrs passed to the constructor.
    //
    // Returns:
    //    A new object of the class used to call this method.
    static constructFromText(text, given_attrs = {}) {
        const cls = this.prototype;
        const factory = function(file_attrs) {
            const attrs = Object.assign({}, given_attrs, file_attrs);
            return new cls.constructor(attrs);
        }
        return Spectrum.parseText(text, cls.header_map, factory);
    }
}
Data.prototype.header_map = {
    'Name' : null,
    'Type' : null,
};
Data.prototype.properties = [
    'name',
];


class Dye extends Data
{
    validate() {
        for (let s_name of ['emission', 'excitation']) {
            if (! (this[s_name] instanceof Spectrum))
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
Dye.prototype.properties = Data.prototype.properties.concat([
    'emission',
    'ex_coeff',
    'excitation',
    'q_yield',
]);


class Excitation extends Data
{
    validate() {
        if (! (this.intensity instanceof Spectrum))
            return "'intensity' property is not a Spectrum object";
        if (! this.intensity.isValid())
            return this.intensity.validation_error;
    }
}
Excitation.prototype.properties = Data.prototype.properties.concat([
    'intensity',
]);


// Reflection/Transmission mode is not a property of the filter, it's
// a property of the Optical Setup.  So it's up to Setup to keep track
// of how the filter is being used.
class Filter extends Data
{
    constructor(attrs) {
        // Some Filter files have reflection instead of transmission
        // so compute it.
        if (attrs.reflection !== undefined) {
            const data = attrs.reflection.data.map(x => 1.0 -x);
            const wavelength = attrs.reflection.wavelength;
            attrs.transmission = new Spectrum(wavelength, data);
        }
        super(attrs);
        if (attrs.reflection !== undefined)
            this.reflection = attrs.reflection;
    }

    get
    reflection() {
        // lazy-get reflection, only compute if needed.
        const data = this.transmission.data.map(x => 1.0 -x);
        const reflection = new Spectrum(this.transmission.wavelength, data);
        this.reflection = reflection;
        return this.reflection;
    }

    set
    reflection(val) {
        // Delete the lazy-getter when setting the value
        delete this.reflection;
        Object.defineProperty(this, 'reflection', {value: val});
    }

    validate() {
        if (! (this.transmission instanceof Spectrum))
            return "'transmission' property is not a Spectrum object";
        if (! this.transmission.isValid())
            return this.transmission.validation_error;
    }
}
Filter.prototype.properties = Data.prototype.properties.concat([
    'transmission',
]);


class FilterSet extends Model
{
    constructor(dye, excitation, ex_path, em_path) {
        super();
        this.dye = dye;
        this.excitation = excitation;
        this.ex_path = ex_path;
        this.em_path = em_path;
    }

    validate() {
        for (let path of [this.ex_path, this.em_path])
            for (let f of path)
                if (f.mode !== 'r' || f.mode !== 't')
                    return `mode of '${ f.name }' must be r or t`;
    }

    static
    parseFilterSet(line) {
        // Args:
        //     line (String): the second part of a FilterSet definition,
        //         i.e., the whole line minus the first column which
        //         has the FilterSet name.
        //
        // Returns:
        //     An Object with the fields dye, excitation, ex_path, and
        //     em_path.  The values for ex_path and em_path are Array
        //     of Objects, with the values name and mode.
        const line_parts = line.split(',').map(x => x.trim());

        // Their values must be strings, so do pass an empty string if empty.
        const dye = line_parts[0];
        const excitation = line_parts[1];

        const ex_path = [];
        const em_path = [];
        let path = ex_path; // push into ex_path until we see '::'
        for (let filt of line_parts.slice(2)) {
            const c_idx = filt.indexOf('::');
            if (c_idx !== -1) {
                let field = filt.slice(0, c_idx).trim();
                path.push(FilterSet.parseFilterField(field));
                path = em_path; // Start filling em_path now
                field = filt.slice(c_idx+2).trim();
                path.push(FilterSet.parseFilterField(field));
            }
            else
                path.push(FilterSet.parseFilterField(filt))
        }
        return new FilterSet(dye, excitation, ex_path, em_path);
    }

    static
    parseFilterField(field) {
        // Args:
        //     field (String): the filter definition, whose format is
        //     'filter_name mode' where mode is 'R|T'
        const split = field.lastIndexOf(' ');
        if (split === -1)
            throw new Error(`invalid filter definition '${ field }'`);

        const name = field.slice(0, split);
        const mode = field.slice(split+1).toLowerCase();
        if (mode !== 't' && mode !== 'r')
            throw new Error(`invalid filter mode '${ mode }'`);

        return {'name': name, 'mode': mode};
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
            // The filters are an array of Objects with filter and
            // mode keys.  We can't use a Map and the filter as key
            // because we may have the same filter multiple times.
            // 'filter' value is a Filter object. 'mode' value is a
            // char with value of 'r' or 't'.
            ex_path: [],
            em_path: [],
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

    // FIXME: this returns a filterset for historical reasons
    clone() {
        const clone = new FilterSet();
        clone.dye = this.dye.name;
        clone.excitation = this.excitation.name;
        for (let path_name of ['ex_path', 'em_path']) {
            clone[path_name] = this[path_name].map(
                x => ({name: x.filter.name, mode: x.mode})
            )
        }
        return clone;
    }

    transmission() {
        //
    }

    ex_efficiency() {
    }

    em_efficiency() {
    }

    brightness() {
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
        this._models = []; // Actually, promises of a model.
        this.uids = []; // Array of Strings (the names which are unique)
    }

    validate() {
        if (this._models.length !== this.uids.length)
            return 'Number of models and uids is not the same';
        if (this._models.some(x => x !== undefined && ! (x instanceof Promise)))
            return 'Models must all be promises (or undefined)';
    }

    add(uid, model) {
        if (this.uids.indexOf(uid) !== -1)
            throw new Error(`There is already '${ uid }' in collection`);
        if (! (model instanceof Promise))
            model = new Promise((r) => r(model));

        this._models.push(model);
        this.uids.push(uid);
        this.trigger('add', model);
    }

    has(uid) {
        return this.uids.indexOf(uid) !== -1;
    }

    get(uid) {
        // Returns a Promise!!!
        const index = this.uids.indexOf(uid);
        if (index === -1)
            throw new Error(`No object named '${ uid }' in collection`);
        if (this._models[index] === undefined)
            this._models[index] = this.fetch_model(uid);
        return this._models[index];
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
        this.uids = data.slice(0);
        // XXX: maybe we should fill the models with promises?
        this._models = new Array(this.uids.length);
        this.trigger('reset');
    }

    reset(uids) {
        this.uids = uids.slice(0);
        // XXX: maybe we should fill the models with promises?
        this._models = new Array(this.uids.length);
        this.trigger('reset');
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
        // Inject the uid/name into the initial list of attributes
        // passed to the factory.  The name in the file content is
        // ignored because 1) experience has shown us that most of the
        // file content is wrong anyway; and 2) needs to be equal as
        // the value used for ID by the Collection so the name on the
        // dropdown menu matches the name shown on the plot.
        const attrs = {
            name: uid
        };
        return $.ajax({
            url: fpath,
            dataType: 'text',
        }).then(text => this.factory(text, attrs));
    }
}


class FilterSetCollection extends Collection
{
    constructor(filename) {
        super();
        this.url += filename; // plain text file, no file extension
    }

    fetch() {
        return super.fetch({dataType: 'text'});
    }

    resetWithData(text) {
        this.uids = [];
        this._models = [];
        for (let line of text.split('\n')) {
            line = line.trim();
            if (line.startsWith('#') || line.length === 0)
                continue; // skip comments and empty lines
            const split_index = line.indexOf(',');
            if (split_index === -1)
                throw new Error(`invalid filterset '${ line }'`);
            const uid = line.slice(0, split_index);
            const filterset_line = line.slice(split_index+1);
            this.uids.push(uid);
            this._models.push(new Promise(function(resolve, reject) {
                resolve(FilterSet.parseFilterSet(filterset_line));
            }));
        }
        this.trigger('reset');
    }

}


class CollectionView
{
    constructor($el, collection) {
        this.$el = $el;
        this.collection = collection;
        this.collection.on('reset', this.render, this);
        this.collection.on('add', this.render, this);
    }

    render() {
    }
}

// Displays a Collection as option lists in a select menu with an
// empty entry at the top.  Used to select a FilterSet, a Dye, and
// Excitation.
class SelectView extends CollectionView
{
    render() {
        const names = [''].concat(this.collection.uids);
        const html = names.map(name => this.option_html(name));
        this.$el.html(html);
    }

    option_html(name) {
        return `<option value="${ name }">${ name }</option>\n`;
    }
}

// Used for list-group, the ones used by the FilterSetBuilder
class ListItemView extends CollectionView
{
    render() {
        this.$el.html(this.collection.uids.map(name => this.li_html(name)));
    }

    li_html(name) {
        return `<li class="list-group-item">${ name }</li>\n`;
    }
}

class PathView
{
    constructor($el, path) {
        this.$el = $el;
        this.path = path;
    }

    render() {
        this.path.map(f => li_html(f.filter.name, f.mode));
    }

    li_html(name, mode) {
        return '<li class="list-group-item">' +
            `${ name }` +
            '<button type="button" class="close" aria-label="Mode">' +
            `<span aria-hidden="true">${ mode }</span>` +
            '</button>' +
            '<button type="button" class="close" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
            '</button>' +
            '</li>';
    }
}


// Displays the GUI to construct a FilterSet.  This a bit more complex
// that just a drop down menu, it also includes the list-group for the
// emission and excitation paths.
//
// There must be three ul elements inside $el with ids:
//    #filters
//    #ex-path
//    #em-path
class FilterSetBuilder
{
    constructor($el, filters, setup) {
        // Args:
        //     $el: jquery for the builder div
        //     filters (DataCollection<Filter>)
        //     setup (OpticalSetup)
        this.$el = $el;
        this.filters = filters;
        this.setup = setup;
        // Maybe we should do some checking here...
        this.$filters = $($el.find('#filters-view')[0]);
        this.$ex_path = $($el.find('#ex-path')[0]);
        this.$em_path = $($el.find('#em-path')[0]);

        this.filters_view = new ListItemView(this.$filters, this.filters);
        this.filters_view.li_html = function(name) {
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

        this.ex_path_view = new PathView(this.$ex_path, this.setup.ex_path);
        this.em_path_view = new PathView(this.$em_path, this.setup.em_path);

        this.setup.on('change', this.ex_path_view.render, this.ex_path_view);
        this.setup.on('change', this.em_path_view.render, this.em_path_view);
        // on adding filter to ex_path, get the filter name from the
        // collection, and then add
    }

    render() {
        const html = this.collection.uids.map(name => this.option_html(name));
        this.$el.html(html);
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
                            labelString: 'Wavelength (nm)',
                        },
                        ticks: {
                            suggestedMin: 380,
                            suggestedMax: 780,
                            // Seems like we only want to show this
                            // range, even if we have spectrum data
                            // beyond it.
                            min: 300,
                            max: 800,
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
            const excitation = this.setup.excitation;
            datasets.push(this.asChartjsDataset(excitation.intensity,
                                                excitation.name));
        }

        if (this.setup.dye !== null) {
            const dye = this.setup.dye;
            datasets.push(this.asChartjsDataset(dye.excitation,
                                                dye.name + '(ex)'));
            datasets.push(this.asChartjsDataset(dye.emission,
                                                dye.name + '(em)'));
        }

        for (let conf of this.setup.ex_path) {
            let mode;
            if (conf.mode === 't')
                mode = 'transmission';
            else if (conf.mode === 'r')
                mode = 'reflection';
            else
                throw new Error(`invalid mode '${ conf.mode }'`);
            const name = `${ conf.name} (${ conf.mode })`;
            datasets.push(this.asChartjsDataset(conf.filter[mode],
                                                name));
        }

        this.plot.data.datasets = datasets;
        this.plot.update();
    }

    static dashes() {
        // LineDash styles to use on spectrum lines of filters only.
        return [[8,4], [16,4], [4,8,4], [4,8,8]];
    }
}


class AddDialog
{
    constructor($el, collections) {
        this.$el = $el;
        this.collections = collections;

        this.$failure = $el.find('#failure');
        this.model = null;

        // This will empty all text from the modal dialog.  This text
        // may be from a previous session but may also be from the
        // last view of the modal dialog.  Removing it each time means
        // that the setup line needs to be typed in one go since the
        // user won't be able to exit the modal to take a look at the
        // list of filters and dyes and then come back to continue.
        //
        // If we have to reset the object each time, maybe this should
        // constructed each time instead?
        this.$el.on('show.bs.modal', this.reset.bind(this));
        this.$add_button.on('click', this.add.bind(this));
    }

    reset() {
        // FIXME:
        // This is suggesting me that instead of reseting we should be
        // constructing a new Dialog each time.
        this.$failure.attr('hidden', '');
        this.model = null;
    }


    add() {
        // TODO check validation section on bootstrap forms section
        try {
            this.readModel();
        } catch (e) {
            this.showFailure(e.message);
            return;
        }
        const uid = this.model.name;
        if (! uid) {
            this.showFailure('A name is required');
            return;
        } else {
            try {
                this.collection.add(uid, this.model);
            } catch (e) {
                this.showFailure(e.message);
                return;
            }
        }
        this.$el.modal('hide');
    }

    showFailure(text) {
        this.$failure.html(text);
        this.$failure.removeAttr('hidden');
    }
}


class SaveSetupDialog
{
    constructor($el, filtersets, setup) {
        this.$el = $el;
        this.filtersets = filtersets; // filterset collection
        this.setup = setup; // Current setup

        this.$name = $el.find('#setup-name');
        this.$save_button = $el.find('#save-button');
        this.$failure = $el.find('#failure');

        this.$el.on('show.bs.modal', this.reset.bind(this));
        this.$save_button.on('click', this.add.bind(this));
    }

    reset() {
        this.$name.val('');
        this.$failure.attr('hidden', '');
    }

    add() {
        const uid = this.$name.val().trim();
        if (! uid) {
            this.showFailure('A name is required');
            return;
        } else {
            try {
                const setup = this.setup.clone();
                this.filtersets.add(uid, setup);
            } catch (e) {
                this.showFailure(e.message);
                return;
            }
        }
        this.$el.modal('hide');
    }

    showFailure(text) {
        this.$failure.html(text);
        this.$failure.removeAttr('hidden');
    }
}

class SpekCheckController
{
    constructor() {
        this.setup = new OpticalSetup;
        this.plot = new OpticalSetupPlot($('#setup-plot')[0].getContext('2d'),
                                         this.setup);

        this.filtersets = new FilterSetCollection('sets');
        this.filtersets_view = new SelectView($('#filterset-selector'),
                                          this.filtersets);

        const dye_reader = Dye.constructFromText.bind(Dye);
        this.dyes = new DataCollection('dyes', dye_reader);
        this.dyes_view = new SelectView($('#dye-selector'), this.dyes);

        const excitation_reader = Excitation.constructFromText.bind(Excitation);
        this.excitations = new DataCollection('excitation', excitation_reader);
        this.excitations_view = new SelectView($('#source-selector'),
                                                 this.excitations);

        const filter_reader = Filter.constructFromText.bind(Filter);
        this.filters = new DataCollection('filters', filter_reader);
        this.filterset_builder = new FilterSetBuilder($('#filterset-builder'),
                                                      this.filters, this.setup);

        // We need to fetch the list of dyes, excitations, and
        // filters, before we can load existing filtersets.
        Promise.all(
            [this.dyes, this.excitations, this.filters].map(x => x.fetch())
        ).then(() => this.filtersets.fetch())

        this.filtersets_view.$el.on('change',
                                    this.handleChangeFilterSetEv.bind(this));
        this.excitations_view.$el.on('change',
                                     this.handleChangeExcitationEv.bind(this));
        this.dyes_view.$el.on('change',
                              this.handleChangeDyeEv.bind(this));

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
        this.save_setup_dialog = new SaveSetupDialog($('#save-setup-dialog'),
                                                    this.filtersets,
                                                   this.setup);

        this.import_dialog = new ImportDialog($('#import-dialog'),
                                              {'Dye': this.dyes,
                                               'Filter': this.filters,
                                               'Source': this.sources,});
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
    addSetup(ev) {
        // FIXME: this transversing and searching can't be right.
        const $dialog = $($(ev.target).parents('div')[3]);
        const name = $dialog.find('#name').val().trim();
        if (! name)
            ups()
        const line = $dialog.find('#configuration').val().trim();
        const filterset = FilterSet.parseFilterSet(line);
        console.log(name);
        console.log(filterset);
    }

    handleChangeDyeEv(ev) {
        const uid = ev.target.value;
        if (uid === '') {
            this.user_selected_dye = false;
            this.changeDye(null, uid);
        } else {
            this.user_selected_dye = true;
            this.dyes.get(uid).then(
                d => this.changeDye(d, uid)
            );
        }
    }
    changeDye(dye, uid) {
        this.setup.dye = dye;
        this.dyes_view.$el.val(uid);
    }

    handleChangeExcitationEv(ev) {
        const uid = ev.target.value;
        if (uid === '') {
            this.user_selected_excitation = false;
            this.changeExcitation(null, uid);
        } else {
            this.user_selected_excitation = true;
            this.excitations.get(uid).then(
                ex => this.changeExcitation(ex, uid)
            );
        }
    }
    changeExcitation(excitation, uid) {
        this.setup.excitation = excitation;
        this.excitations_view.$el.val(uid);
    }

    handleChangeFilterSetEv(ev) {
        const uid = ev.target.value;
        if (uid === '') {
            this.changeFilterSet(null, uid);
        } else {
            // FIXME: possibility of a race condition if setups are
            // changed rapidly.
            this.filtersets.get(uid).then(fs => this.changeFilterSet(fs));
        }
    }

    changeFilterSet(new_filterset) {
        // The setup dye and excitation are only the setup preference
        // but are actually part of a filter set.  So only change
        // those if a user has not yet selected it manually.  This has
        // the issue that a user is unable to see only the filter sets
        // because if the dye and excitation are not selected,
        // selecting a filterset will also display this preferences.
        if (! this.user_selected_dye) {
            const uid = new_filterset.dye;
            if (uid === '')
                this.changeDye(null, uid);
            else
                this.dyes.get(uid).then(
                    dye => this.changeDye(dye, uid)
                );
        }
        if (! this.user_selected_excitation) {
            const uid = new_filterset.excitation;
            if (uid === '')
                this.changeExcitation(null, uid);
            else
                this.excitations.get(uid).then(
                    ex => this.changeExcitation(ex, uid)
                );
        }

        for (let path_name of ['ex_path', 'em_path']) {
            const path = new_filterset[path_name];
            const filter_promises = [];
            for (let i = 0; i < path.length; i++) {
                const uid = path[i].name;
                filter_promises.push(
                    this.filters.get(uid).then(
                        f => ({
                            name: uid,
                            filter: f,
                            mode: path[i].mode,
                        })
                    )
                );
            }

            Promise.all(filter_promises).then(
                (filters) => this.setup[path_name] = filters
            );
        }
    }
}

$(document).ready(function() {
    const spekcheck = new SpekCheckController;
});
