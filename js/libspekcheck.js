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


'use strict';

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
        // However, this is only used by SetupPlot which
        // already keeps a cache of his own.
        const max_index= this.data.reduce(
            (iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0
        );
        return this.wavelength[max_index];
    }
}


// Base class for our Data: Dye, Excitation, and Filter classes.
//
// It provides a nice default constructor and factory from file text.
// It requires two static data members wich configure the constructor
// and the factory/reader:
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
        // All declared properties must be defined.
        for (let p of this.constructor.prototype.properties) {
            if (attrs[p] === undefined)
                throw new Error(`missing property '${ p }'`);
            this[p] = attrs[p];
        }
    }

    static
    parseHeader(header) {
        // Args:
        //     header (Array): one item per text line.
        //
        // Returns:
        //     An Object of attributes, keys taken from the class
        //     'header_map' property.

        const header_map = this.prototype.header_map;

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
        //    csv (Array): one item per line.
        //
        // Returns:
        //    An Object with the spectrum names as keys, and Spectrum
        //    objects as values.
        //
        // First line of CSV content tells us: 1) the number of
        // columns/spectrum; 2) name to give to each spectrum.  We
        // ignore the name of the first column, but it should be
        // 'wavelength'.

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
    constructFromText(text, caller_attrs) {
        // Construct an instance from file content.
        //
        // Our data files have a multi-line text header of the form:
        //
        //    key 1: float value
        //    key 2: float value
        //    # An optional comment
        //
        // This header is followed by CSV like:
        //
        //    wavelength, spectra name #1, spectra name #2
        //    x, y, z
        //
        // The 'key' values are case-sensitive and used to index
        // 'header_map'.  The 'spectra name #N' will be used as a
        // property keys on attrs passed to the constructor.
        // Everything is case-sensitive.
        //
        // Args:
        //     text (String): the file content.
        //
        //     caller_attrs (Object): will be merged with the
        //         attributes read from the file.  Can be used to
        //         inject extra attributes not available on the file
        //         or to overwrite the values read from the file.
        //
        // Returns:
        //    A Data instance (dependent on the class used to call it).

        const header_map = this.prototype.header_map;

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

        const header_attrs = this.parseHeader(header);
        const csv_attrs = this.parseCSV(csv);

        // The file header and CSV contents must not have duplicated
        // properties.  However, enable the overwriting of properties
        // by the caller.
        if (Object.keys(header_attrs).some(x => csv_attrs.hasOwnProperty(x)))
            throw new Error('csv and header have duplicate properties');
        const attrs = Object.assign({}, header_attrs, csv_attrs, caller_attrs);

        return new this.prototype.constructor(attrs);
    }
}
Data.prototype.header_map = {
    'Name': null,
    'Type': null,
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


// Represents one of the two paths (excitation and emission) on a
// Setup.  This is pretty much an Array with empty() and on() methods.
class Path extends Model
{
    constructor(array=[]) {
        super();
        this._filters = array; // Array of {filter: Filter, mode: 'r'|'t'}
    }

    validate() {
        for (let x of this._filters) {
            if (! (x.filter instanceof Filter))
                return "all elements of Path must have a 'Filter'";
            if (! x.filter.isValid())
                return x.filter.validation_error;
            if (x.mode !== 'r' || x.mode !== 't')
                return `mode of '${ x.filter.name }' must be r or t`;
        }
    }

    describe() {
        return this._filters.map(x => ({filter: x.filter.name, mode: x.mode}));
    }

    empty() {
        this._filters = [];
        this.trigger('change');
    }

    map(callback) {
        return this._filters.map(callback);
    }

    push() {
        const count = this._filters.push(...arguments);
        this.trigger('change');
        return count;
    }

    [Symbol.iterator]() {
        return this._filters[Symbol.iterator]();
    }
}

// Like an Setup object but with Data instances (Dye, Excitation, and
// Filter) replaced with their names/uids, and Path replaced with an
// Array.  This let us to have a representation of them without
// parsing all the filters, excitation, and dyes files.  Also much
// easier to save them.
//
// See also the Setup class.
class SetupDescription extends Model
{
    constructor(dye, excitation, ex_path, em_path) {
        super();
        this.dye = dye; // String or null
        this.excitation = excitation; // String or null
        this.ex_path = ex_path; // Array of {filter: String, mode: 'r'|'t'}
        this.em_path = em_path; // Array of {filter: String, mode: 'r'|'t'}
    }

    validate() {
        for (let name of ['dye', 'excitation'])
            if (! (this[name] instanceof String) && this[name] !== null)
                return `${ name } must be a String or null`;

        for (let path_name of ['ex_path', 'em_path']) {
            const path = this[path_name];
            if (! (path instanceof Array))
                return `${ path_name } must be an Array`;

            for (let x of path) {
                if (! (x.filter instanceof String))
                    return `values of ${ path_name } must have 'filter'`;
                if (x.mode !== 'r' || x.mode !== 't')
                    return `mode of '${ x.filter }' must be r or t`;
            }
        }
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

        return {'filter': name, 'mode': mode};
    }

    static
    constructFromText(text) {
        // Args:
        //     line (String): the actual SetupDescription,
        //         i.e., the whole line on the 'sets' file minus the
        //         first column (which has the Setup name).
        //
        // Returns:
        //     An SetupDescription instance.
        const fields = text.split(',').map(x => x.trim());

        const dye = fields[0] || null;
        const excitation = fields[1] || null;

        const ex_path = [];
        const em_path = [];
        let path = ex_path; // push into ex_path until we see '::'
        for (let filt of fields.slice(2)) {
            const c_idx = filt.indexOf('::');
            if (c_idx !== -1) {
                let field = filt.slice(0, c_idx).trim();
                path.push(this.parseFilterField(field));
                path = em_path; // Start filling em_path now
                field = filt.slice(c_idx+2).trim();
                path.push(this.parseFilterField(field));
            }
            else
                path.push(this.parseFilterField(filt))
        }
        return new SetupDescription(dye, excitation, ex_path, em_path);
    }
}


// Handles the computation of the Setup efficiency, transmission, etc.
//
// It triggers change events for the dye, excitation, ex_path, and
// em_path.  This is the model for what will eventually get displayed.
// All user interactions get modelled into changes to an Setup
// instance.
//
// There is also an SetupDescription which does not have the
// actual Dye, Excitation, and Filter objects.
class Setup extends Model
{
    constructor() {
        super();
        // Adds a setter and getter for this properties, so it
        // triggers change events for all of them.
        const defaults = {
            dye: null,
            excitation: null,
            // The filters are an array of Objects with filter and
            // mode keys.  We can't use a Map and the filter as key
            // because we may have the same filter multiple times.
            // 'filter' value is a Filter object. 'mode' value is a
            // char with value of 'r' or 't'.
            ex_path: new Path,
            em_path: new Path,
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

        this.ex_path.on('change', this.trigger.bind(this, 'change'));
        this.em_path.on('change', this.trigger.bind(this, 'change'));
    }

    // Describe this instance, i.e., replace the Filter, Dye, and
    // Excitation objects with their names.
    describe() {
        const description = SetupDescription(
            this.dye ? this.dye.name : null,
            this.excitation ? this.excitation.name : null,
            this.ex_path.describe(),
            this.em_path.describe(),
        );
        if (! description.isValid())
            throw new Error(description.validation_error);
        return description;
    }

    empty() {
        this.dye = null;
        this.excitation = null;
        this.ex_path.empty();
        this.em_path.empty();
        this.trigger('change');
    }

    transmission() {
        // TODO
    }

    ex_efficiency() {
        // TODO
    }

    em_efficiency() {
        // TODO
    }

    brightness() {
        // TODO
    }
}


// Our base class for Collections.
//
// A lot of functionality here is async because the actual Model it
// stores will only be created when required (so that the data files
// are only parsed if needed).
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
        model.then((m) => this.trigger('add', [uid, m]));
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


class SetupCollection extends Collection
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
                throw new Error(`invalid setup line '${ line }'`);
            const uid = line.slice(0, split_index);
            const setup_line = line.slice(split_index+1);
            this.uids.push(uid);
            this._models.push(new Promise(function(resolve, failure) {
                resolve(SetupDescription.constructFromText(setup_line));
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

    append(name) {
    }
}

// Displays a Collection as option lists in a select menu with an
// empty entry at the top.  Used to select a Setup, a Dye, and
// Excitation.
class SelectView extends CollectionView
{
    render() {
        const names = [''].concat(this.collection.uids);
        const html = names.map(name => this.option_html(name));
        this.$el.html(html);
    }

    append(name, model) {
        this.$el.append(this.option_html(name));
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
        this.path.on('change', this.render, this);
    }

    render() {
        const html = this.path.map(f => this.li_html(f.filter.name, f.mode));
        this.$el.html(html);
    }

    li_html(name, mode) {
        const html = `
<li class="list-group-item">
  ${ name } fo
  <div class="btn-group btn-group-toggle" data-toggle="buttons">
    <label class="btn btn-sm ${ mode === 't' ? 'btn-primary active' : 'btn-secondary' }">
      <input type="radio" ${ mode === 't' ? 'checked' : '' }>T
    </label>
    <label class="btn btn-sm ${ mode === 'r' ? 'btn-primary active' : 'btn-secondary' }">
      <input type="radio" ${ mode === 'r' ? 'checked' : '' }>R
    </label>
  </div>
  <button type="button" class="close" aria-label="Close">
    <span aria-hidden="true">&times;</span>
  </button>
</li>`
        return html;
    }
}


// Displays the GUI to modify the light paths.  This a bit more
// complex that just a drop down menu, it also includes the list-group
// for the emission and excitation paths.
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
        //     setup (Setup)
        this.$el = $el;
        this.setup = setup;

        this.filters = {
            collection: filters,
            $el: $($el.find('#filters-view')[0]),
        };

        this.filters.view = new ListItemView(this.filters.$el,
                                             this.filters.collection);
        this.filters.view.li_html = function(name) {
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

        for (let path of ['ex_path', 'em_path']) {
            const $el_path = $($el.find('#' + path)[0]);
            this[path] = {
                '$el': $el_path,
                'view': new PathView($el_path, this.setup[path]),
            };
        }
    }

    render() {
        const html = this.collection.uids.map(name => this.option_html(name));
        this.$el.html(html);
    }
}


class SetupPlot
{
    constructor($el, setup) {
        this.$el = $el;
        this.setup = setup;
        this.plot = new Chart(this.$el[0].getContext('2d'), {
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

        for (let x of [...this.setup.ex_path, ...this.setup.em_path]) {
            const mode = x.mode === 't' ? 'transmission' : 'reflection';
            const name = `${ x.filter.name } (${ x.mode })`;
            datasets.push(this.asChartjsDataset(x.filter[mode], name));
        }

        this.plot.data.datasets = datasets;
        this.plot.update();
    }

    downloadLink(format='image/png') {
        return this.$el[0].toDataURL(format);
    }

    static dashes() {
        // LineDash styles to use on spectrum lines of filters only.
        return [[8,4], [16,4], [4,8,4], [4,8,8]];
    }
}


class ImportDialog
{
    constructor($el, options) {
        this.$el = $el;
        this.options = options; // maps option value to a DataCollection

        this._$name = $el.find('#file-name');
        this._$file_type = $el.find('#file-type');
        this._$file_input = $el.find('#file-selector');
        this._$file_label = $el.find('.custom-file-label');
        this._$import_button = $el.find('#import-button');
        this._$failure = $el.find('#failure');

        this.$el.on('show.bs.modal', this.reset.bind(this));
        this._$import_button.on('click', this.import.bind(this));
        this._$file_input.on('change', this.selectFile.bind(this));
    }

    reset() {
        this._$failure.attr('hidden', '');

        this._$name.val(''); // Maybe we shouldn't reset the name?

        // Don't empty the filelist so that selecting a new file will
        // start where the last one was selected from.
        const filelist = this._$file_input[0].files;
        if (filelist.length !== 0)
            this._$file_label.text(filelist[0].name);
    }

    selectFile() {
        this.$file_label.text(this._$file_input[0].files[0].name);
    }

    // TODO: might not be a bad idea to use bootstrap form validation.
    import() {
        const type = this._$file_type.val();
        const collection = this.options[type];
        if (! (collection instanceof DataCollection))
            throw new Error(`invalid data type ${ type } selected`);

        const name = this._$name.val();
        if (! name) {
            this.showFailure('Name is required');
            return;
        }
        const filelist = this._$file_input[0].files;
        if (! (filelist[0] instanceof File)) {
            this.showFailure('File is required');
            return;
        }

        const reader = new FileReader;

        reader.onload = (function() {
            const attrs = {'name': name};
            try {
                const data = collection.factory(reader.result, attrs);
                collection.add(name, data);
            } catch (e) {
                this.showFailure(e.message);
                return;
            }
            this.$el.modal('hide');
        }).bind(this);

        reader.onerror = (function(ev) {
            this.showFailure(ev.message);
        }).bind(this);

        reader.readAsText(filelist[0]);
    }

    showFailure(text) {
        this._$failure.html(text);
        this._$failure.removeAttr('hidden');
    }
}


class SaveSetupDialog
{
    constructor($el, setups, setup) {
        this.$el = $el;
        this.setups = setups; // Collection<SetupDescription>
        this.setup = setup; // Setup

        this._$name = $el.find('#setup-name');
        this._$save_button = $el.find('#save-button');
        this._$failure = $el.find('#failure');

        this.$el.on('show.bs.modal', this.reset.bind(this));
        this._$save_button.on('click', this.add.bind(this));
    }

    reset() {
        this._$name.val('');
        this._$failure.attr('hidden', '');
    }

    add() {
        const uid = this._$name.val().trim();
        if (! uid) {
            this.showFailure('A name is required');
            return;
        } else {
            try {
                const description = this.setup.describe();
                this.setups.add(uid, description);
            } catch (e) {
                this.showFailure(e.message);
                return;
            }
        }
        this.$el.modal('hide');
    }

    showFailure(text) {
        this._$failure.html(text);
        this._$failure.removeAttr('hidden');
    }
}

class Controller
{
    constructor() {
        // Changes are done to this instance of Setup which then
        // triggers the SetupPlot to update its display.
        this.live_setup = new Setup;
        this.plot = new SetupPlot(
            $('#setup-plot'),
            this.live_setup,
        );

        $('#save-plot-button').on('click', this.savePlot.bind(this));

        const data_map = {
            dye: {
                filename: 'dyes',
                reader: Dye.constructFromText.bind(Dye),
            },
            excitation: {
                filename: 'excitation',
                reader: Excitation.constructFromText.bind(Excitation),
            },
            filter: {
                filename: 'filters',
                reader: Filter.constructFromText.bind(Filter),
            },
            setup: {
                filename: 'sets',
            },
        };

        // A Collection for each data type.
        for (let type of ['dye', 'excitation', 'filter']) {
            this[type] = {
                collection: new DataCollection(
                    data_map[type].filename,
                    data_map[type].reader,
                ),
            };
        }
        // Setup Collection is special
        this.setup = {
            collection: new SetupCollection('sets')
        };

        // A View for this collections.
        for (let type of ['dye', 'excitation', 'setup']) {
            this[type].view = new SelectView(
                $('#' + type + '-selector'),
                this[type].collection,
            );
        }

        // The Filters Collection does not have a View.  Instead, it
        // is part of the FilterSetBuilder GUI.
        this.filterset_builder = new FilterSetBuilder(
            $('#filterset-builder'),
            this.filter.collection,
            this.live_setup,
        );

        // Need to fetch the list of dyes, excitations, and filters,
        // before loadind the setup configurations.  This prevents the
        // user from selecting a setup before the list of its
        // components is available.
        Promise.all(
            ['dye', 'excitation', 'filter'].map(x => this[x].collection.fetch())
        ).then(() => this.setup.collection.fetch())

        for (let type of ['setup', 'excitation', 'dye']) {
            this[type].view.$el.on('change',
                                   this.handleChangeEv.bind(this, type));
        }

        // Setup description includes a Dye, the logic being that the
        // setup is often designed for it.  However, a user can also
        // be interested in inspecting different Setups for a specific
        // Dye in which case the Dye selection should remain fixed
        // when changing Setup.
        //
        // To support both cases, we keep track whether the current
        // Dye selection comes from manual choice, and only change it
        // to the Setup.dye if not.
        this.user_selected_dye = false;

        this.save_setup_dialog = new SaveSetupDialog($('#save-setup-dialog'),
                                                     this.setup.collection,
                                                     this.live_setup);

        this.import_dialog = new ImportDialog($('#import-file-dialog'),
                                              {'dye': this.dye.collection,
                                               'filter': this.filter.collection,
                                               'source': this.excitation.collection,});

        // If someone imports a Dye or Excitation, change to it.
        for (let type of ['dye', 'excitation'])
            this[type].collection.on('add', this.changeData.bind(this, type));
    }

    changeData(type, val, data) {
        // Args:
        //     type (String): one of 'dye', 'excitation', or 'setup'
        //     uid (String): the value to display on the GUI.  Likely
        //         an empty string if 'data' is null.
        //     data (Model): a Dye, Excitation, or SetupDescription
        //         object dependent on the value of 'type', which will
        //         modify this.live_setup.

        if (type === 'setup') {
            if (data === null) {
                this.live_setup.empty();
                return;
            }

            // Only change dye if a user has not selected it manually.
            if (! this.user_selected_dye) {
                const dye_val = data.dye === null ? '' : data.dye;
                this.dye.view.$el.val(dye_val).trigger('change');
                // trigger makes it look like the user did it, so fix it.
                this.user_selected_dye = false;
            }

            const ex_val = data.excitation === null ? '' : data.excitation;
            this.excitation.view.$el.val(ex_val).trigger('change');

            for (let path_name of ['ex_path', 'em_path']) {
                const path = this.live_setup[path_name];
                path.empty();
                const filter_promises = [];
                for (let fpos of data[path_name]) {
                    filter_promises.push(
                        this.filter.collection.get(fpos.filter).then(
                            (f) => ({filter: f, mode: fpos.mode})
                        )
                    );
                }
                Promise.all(filter_promises).then(
                    (filters) => path.push(...filters)
                );
            }
        } else {
            this.live_setup[type]= data;
            this[type].view.$el.val(val);
        }
    }

    handleChangeEv(type, ev) {
        const uid = ev.target.value;

        // Remember when a user selects a dye manually to prevent
        // changing it as part of changing setup.  Forget about it,
        // when a user unselects a dye.
        if (type === ' dye') {
            if (uid === '')
                this.user_selected_dye = false;
            else
                this.user_selected_dye = true;
        }

        if (uid === '') {
            this.changeData(type, uid, null);
        } else {
            this[type].collection.get(uid).then(
                m => this.changeData(type, uid, m)
            );
        }
    }

    savePlot(ev) {
        // A useful name for the downloaded image.
        const setup_uid = this.setup.view.$el.val();
        const name = setup_uid !== '' ? setup_uid : 'custom';
        ev.target.download = 'spekcheck-' + name + '.png';

        ev.target.href = this.plot.downloadLink('image/png');
    }
}

$(document).ready(function() {
    const spekcheck = new Controller;
});
