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

    // Subclasses should overload it to return a String with error
    // message, or null if validation passes.
    validate() {
        return null;
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


// Class for Spectrum data and its basic computations.
//
// Not for Detector, Dye, Filter, or Excitation.  Those have
// properties that are Spectrum instances, but they are not a Spectrum
// themselves.  For example, the Dye class will have a emission and
// absorption properties, each of them a Spectrum instance.
//
// Args:
//     wavelength (Array<float>): in nanometers.
//     data (Array<float>): values in the [0 1] range.
//
// We want this class to provide immutable objects which is why the
// methods do not modify the data.  This allow SetupPlot to keep a
// cache of each Spectrum instance converted to Chartjs dataset.
class Spectrum extends Model
{
    constructor(wavelength, data) {
        super();
        this.wavelength = wavelength.slice(0); // Array of floats
        this.data = data.slice(0); // Array of floats
    }

    clone() {
        // The constructor does the cloning of the arrays.
        return new Spectrum(this.wavelength, this.data);
    }

    // Length of the wavelength and data arrays.
    get
    length() {
        return this.wavelength.length;
    }

    set
    length(val) {
        throw new Error('Spectrum.length is a read-only property');
    }

    // Wavelength where this data has its maximum value.
    get
    peak_wavelength() {
        const max_index= this.data.reduce(
            (iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0
        );
        return this.wavelength[max_index];
    }

    set
    peak_wavelength(val) {
        throw new Error('Spectrum.peak_wavelength is a read-only property');
    }

    // Area of the spectrum.
    get
    area() {
        const w = this.wavelength;
        const v = this.data;
        let area = 0.0;
        // We don't handle values below zero because spectrum data
        // should be clipped to [0,1].  This should be done by
        // Data.parseCSV.
        for (let i = 1; i < this.length; i++)
            area += 0.5 * (v[i] + v[i-1])*(w[i] - w[i-1]);
        return area;
    }

    set
    area(val) {
        throw new Error('Spectrum.area is a read-only property');
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

    // Interpolate data for specified wavelengths.
    //
    // Args:
    //     points (Array<float>): wavelengths values for which we
    //         should interpolate data.  Must be in increasing order.
    //
    // Returns:
    //     Array with interpolated values.  For wavelengths outside
    //     this Spectrum range (extrapolation), data will be zero.
    interpolate(points) {
        const new_data = new Array(points.length);

        let i = 0; // index into the interpolated data (new_data)

        // Outside the existing data.  Extrapolate to zero.
        for (; points[i] < this.wavelength[0]; i++)
            new_data[i] = 0.0;

        let this_i = 0; // index into this data/wavelength
        for (; i < points.length; i++) {
            if (points[i] > this.wavelength[this.length -1]) {
                // Outside the existing data.  Extrapolate to zero.
                new_data.fill(0.0, i);
                break;
            }

            while (points[i] > this.wavelength[this_i])
                this_i++;

            // Most data we have uses the same wavelength values (1nm
            // steps of wavelength) so we often get away without
            // actually interpolating anything.
            if (points[i] === this.wavelength[this_i])
                new_data[i] = this.data[this_i++];
            else {
                // Fine! We will do interpolation.
                const x0 = this.wavelength[this_i -1];
                const x1 = this.wavelength[this_i];
                const y0 = this.data[this_i -1];
                const y1 = this.data[this_i];
                const slope = ((y1 - y0) / (x1 - x0));
                new_data[i] = y0 + slope * (points[i] - x0);
            }
        }
        return new_data;
    }

    // Multiply this instance data by something else.
    //
    // Args:
    //     other (Spectrum|Array|Number): if 'other' is an Array, then
    //         it must have the same length as this instance.
    //
    // Returns:
    //     A new Array with this spectrum data multiplied by another.
    //     If 'other' is another Spectrum instance, the wavelength of
    //     this instance is used.
    multiplyBy(other) {
        if (other instanceof Spectrum)
            other = other.interpolate(this.wavelength);

        const new_data = this.data.slice(0);
        if (Array.isArray(other))
            for (let i = 0; i < this.length; i++)
                new_data[i] *= other[i];
        else if (typeof(other) === 'number' || other instanceof Number)
            for (let i = 0; i < this.length; i++)
                new_data[i] *= other;
        else
            throw new Error(`can\'t multiplyBy '${ typeof(other) }'`);

        return new_data;
    }
}


// Base class for our Data: Detector, Dye, Excitation, and Filter classes.
//
// It provides a nice default constructor and factory from file text.
// It requires two static data members wich configure the constructor
// and the factory/reader:
//
//    properties (Array): configures the constructor.  an Array of
//        property names which will be defined on a class instance,
//        and are required at construction time.
//
//    header_map (Map): configures the factory/reader methods.  They
//        map the fields on the header of the files to the keys of the
//        Object passed to the constructor.  null values mean fields
//        to ignore.
//
// Args:
//     attrs(Object): all values in the properties Array must be keys
//         of this 'attrs' instance and will be set on this instance.
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
            for (let header_key of header_map.keys()) {
                if (line.startsWith(header_key)
                    && line[header_key.length] === ':') {
                    const attr_name = header_map.get(header_key);
                    if (attr_name === null)
                        break; // null means value to be ignored

                    // We may need to rethink this in the future.  For
                    // now, all the values we have on the header are
                    // numeric so this is fine.  But if we ever have
                    // different types, we may need to pass a parse
                    // function together with the attribute name.
                    const val = parseFloat(line.slice(header_key.length+2));

                    // If the value can't be parsed (maybe it is
                    // missing), then it read as NaN.  Set to null.
                    attrs[attr_name] = isNaN(val) ? null : val;

                    break; // found it, so move to next line
                }
            }
            // We may get here without having recognized the key.
            // Well, continue anyway, we will check at the end of
            // parsing the header for complete attributes.
        }

        // Confirm we got all properties from the header.
        for (let attr_name of header_map.values())
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
            if (line.length === 0) // ignore empty lines
                continue;
            let vals = line.split(',').map(x => parseFloat(x));
            wavelengths.push(vals[0]);
            for (let i = 0; i < n_spectra; i++)
                spectra[i].push(vals[1+i]);
        }

        // Create the Spectrum objects and correct data first.
        for (let i = 0; i < n_spectra; i++) {
            const data = spectra[i];
            // Rescale to [0 1] if it looks like data is on percent.
            // Data looks like it's in percentage if it has values
            // above 10.  This means that if data is in percentage and
            // all values are below 10%, it will not be rescaled.
            // This should not happen because values in a spectrum are
            // all relative to their maximum value.  Except we also
            // handle the sensitivity of cameras detectors as
            // Spectrum.  Here's to hope that we never have to handle
            // a detector with a maximum sensitivity below 10%.
            if (data.some(x => x > 10.0))
                for (let i = 0; i < data.length; i++)
                    data[i] /= 100.0;

            // Clip values to [0 1]
            for (let i = 0; i < data.length; i++) {
                if (data[i] < 0.0)
                    data[i] = 0.0;
                else if (data[i] > 1.0)
                    data[i] = 1.0;
            }
            attrs[spectra_names[i]] = new Spectrum(wavelengths, data);
        }

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
        // The 'key' values are case-sensitive and used to get the
        // matching property name from 'header_map'.  The 'spectra
        // name #N' will be used as a property keys on 'attrs' passed
        // to the constructor.  Everything is case-sensitive.
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
        let header_length = header_map.size;
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
Data.prototype.header_map = new Map([
    ['Name', null],
    ['Type', null],
]);
Data.prototype.properties = [
    'uid',
];


class Dye extends Data
{
    validate() {
        for (let s_name of ['emission', 'absorption']) {
            if (! (this[s_name] instanceof Spectrum))
                return `${ s_name } property is not a Spectrum object`;
            if (! this[s_name].isValid())
                return this[s_name].validation_error;
        }

        // Careful with the comparison logic here.  We compare for
        // true so that it also checks for the right type.  If we did
        // 'ex_coeff < 0.0' it would return false even if 'ex_coeff'
        // was undefined a String or whatever.
        if (! (this.ex_coeff >= 0.0) && this.ex_coeff !== null)
            return 'Extinction Coefficient must be a positive number';
        if (! (this.q_yield >= 0.0) && this.q_yield !== null)
            return 'Quantum Yield must be a positive number';
    }
}
Dye.prototype.header_map = new Map([
    ...(Data.prototype.header_map),
    ['Extinction coefficient', 'ex_coeff'],
    ['Quantum Yield', 'q_yield'],
]);
Dye.prototype.properties = Data.prototype.properties.concat([
    'emission',
    'ex_coeff',
    'absorption',
    'q_yield',
]);

// Alexa-488 brightness for relative brightness calculations.
Dye.Alexa488_brightness = 0.92 * 73000;


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

class Detector extends Data
{
    validate() {
        if (! (this.qe instanceof Spectrum))
            return "'intensity' property is not a Spectrum object";
        if (! this.qe.isValid())
            return this.intensity.validation_error;
    }
}
Detector.prototype.properties = Data.prototype.properties.concat([
    'qe',
]);


// Reflection/Transmission mode is not a property of the filter, it's
// a property of the Optical Setup.  So it's up to Setup to keep track
// of how the filter is being used.
class Filter extends Data
{
    constructor(attrs) {
        // Some Filter files have reflection data instead of
        // transmission so compute it.
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
        // Delete the lazy-getter and this setter when setting the value.
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


// Meant to represents one of the two paths (excitation and emission)
// on a Setup.
class FilterStack extends Model // also kind of an Array
{
    constructor(stack=[]) {
        super();
        this._stack = stack; // Array of {filter: Filter, mode: 'r'|'t'}
        this._resetCache();
    }

    _resetTransmission() {
        this._transmission = null; // Spectrum or null

        // When a new filter is added to the filterstack, we can add it
        // to the previously computed transmission instead of
        // computing the whole thing again.
        //
        // This is the index of the next filter that needs to be used
        // to update the transmission spectrum.
        this._stack_i = 0;

        // If we reset the transmission, this is implicit.
        this._resetCache();
    }

    _resetCache() {
        // Maps Spectrum instances to their transmission Spectrum in
        // this FilterStack.
        this._transmitted_cache = new WeakMap;
        // Maps Spectrum instances to their transmission efficiency in
        // this FilterStack.
        this._efficiency_cache = new WeakMap;
    }

    // Number of filters in the path.
    get
    length() {
        return this._stack.length;
    }

    set
    length(val) {
        throw new Error('length is a read-only property');
    }

    validate() {
        for (let x of this._stack) {
            if (! (x.filter instanceof Filter))
                return "all elements of FilterStack must have a 'Filter'";
            if (! x.filter.isValid())
                return x.filter.validation_error;
            if (x.mode !== 'r' || x.mode !== 't')
                return `mode of '${ x.filter.uid }' must be r or t`;
        }
    }

    // Transmission spectrum of the whole filter stack
    get
    transmission() {
        // XXX: what to when the stack is empty?  In practice, this
        //     should mean that we have complete transmission in all
        //     wavelengths.  However, the assumption in have in
        //     Spectrum and throughout SpekCheck is that data is zero
        //     whenever we have no information.  So we error to make
        //     note of this odd request.  Alternatively, maybe we
        //     could return Spectrum([0, Inf], [1.0, 1.0])
        if (this.length === 0)
            throw new Error('no filters on stack to compute transmission');

        // Create a new Spectrum object, appropriate to the filters we
        // have in the stack.
        if (this._transmission === null) {
            // Spectrum data outside the range will be zero, so no
            // point on computing those.  Find the smallest wavelength
            // range we actually need.
            let init = -Infinity;
            let end = Infinity;
            for (let x of this._stack) {
                const wavelength = x.filter.transmission.wavelength;
                const x_init = wavelength[0];
                const x_end = wavelength[wavelength.length -1];
                if (x_init > init)
                    init = x_init;
                if (x_end < end)
                    end = x_end;
            }

            // XXX: hardcoded wavelength steps of 1nm :/
            const wavelength = new Array(end-init+1);
            for (let i = 0; i < wavelength.length; i++)
                wavelength[i] = init+i;

            const data = new Array(wavelength.length).fill(1.0);
            this._transmission = new Spectrum(wavelength, data);
        }

        // Update the transmission spectrum with any pending filters.
        if (this._stack_i < this.length) {
            const transmission = this._transmission;
            const wavelength = transmission.wavelength;
            for (; this._stack_i < this.length; this._stack_i++) {
                const mode = this._stack[this._stack_i].mode;
                const filter = this._stack[this._stack_i].filter;

                const pname = mode === 't' ? 'transmission' : 'reflection';
                if (mode !== 't' && mode !== 'r')
                    throw new Error(`invalid mode '${ mode }'`);

                const filter_data = filter[pname].interpolate(wavelength);
                transmission.data = transmission.multiplyBy(filter_data);
            }
            // We should not be modifying Spectrum instances like we
            // just did, so replace it with a clone.
            this._transmission = transmission.clone();
        }

        return this._transmission;
    }

    set
    transmission(val) {
        throw new Error('transmission is a read-only property');
    }

    // Transmission spectrum that 'source' will have in this FilterStack.
    transmissionOf(source) {
        if (! this._transmitted_cache.has(source)) {
            let transmitted;
            if (this.length === 0)
                transmitted = source.clone();
            else
                // Outside the wavelength range, transmission is zero.
                // Use the source wavelength as range for transmitted
                // which we hope will be smaller than FilterStack.
                transmitted = new Spectrum(
                    source.wavelength,
                    source.multiplyBy(this.transmission)
                );

            this._transmitted_cache.set(source, transmitted);
        }
        return this._transmitted_cache.get(source);
    }

    // Efficiency of this
    efficiencyOf(source) {
        if (! this._efficiency_cache.has(source)) {
            let efficiency = 1.0;
            if (this.length !== 0) {
                const transmission = this.transmissionOf(source);
                efficiency = transmission.area / source.area;
            }
            this._efficiency_cache.set(source, efficiency);
        }
        return this._efficiency_cache.get(source);
    }

    describe() {
        return this._stack.map(x => ({filter: x.filter.uid, mode: x.mode}));
    }

    // Like empty, but doesn't trigger a change event.  To be used by
    // Setup so that it can empty both stacks and then trigger a
    // change itself.
    // TODO: instead, Setup should handle the change event and stop it
    //   from being propagated..
    _empty() {
        this._stack = [];
        this._resetTransmission();
    }

    empty() {
        this._empty();
        this.trigger('change');
    }

    getElem(i) {
        return this._stack[i];
    }

    toggleElemMode(i) {
        const old_mode = this._stack[i].mode;
        this._stack[i].mode = old_mode === 'r' ? 't' : 'r';
        this._resetTransmission();
        this.trigger('change');
        return old_mode;
    }

    setElemMode(i, mode) {
        const old_mode = this._stack[i].mode;
        if (old_mode !== mode) {
            this._stack[i].mode = mode;
            this._stack_i = i;
            this._resetCache();
            this.trigger('change');
        }
        return old_mode;
    }

    removeElem(i) {
        const removed = this._stack[i];
        if (removed !== undefined) {
            const old_stack = this._stack;
            this._stack = Array.concat(old_stack.slice(0, i),
                                       old_stack.slice(i+1));
            this._resetTransmission();
            this.trigger('change');
        }
        return removed;
    }

    clone() {
        return new FilterStack(this._stack.slice(0));
    }

    // Whether this instance describes the same FilterStack as other.
    //
    // Args:
    //     other(FilterStack)
    isEqual(other) {
        if (other instanceof Setup)
            other = other.describe();

        if (this.length !== other.length)
            return false;

        for (let p of ['filter', 'mode'])
            for (let i = 0; i < this.length; i++)
                if (this._stack[i][p] !== other._stack[i][p])
                    return false;

        return true;
    }

    map(callback) {
        return this._stack.map(callback);
    }

    push() {
        const count = this._stack.push(...arguments);
        this._resetCache();
        this.trigger('change');
        return count;
    }

    [Symbol.iterator]() {
        return this._stack[Symbol.iterator]();
    }
}

// Like a Setup object but with Data instances (Detector, Dye, Excitation,
// and Filter) replaced with their names/uids, and FilterStack replaced with
// an Array.  This lets us to have a representation of them without
// parsing all the filters, excitation, and dyes files.  Also much
// easier to save them.
//
// See also the Setup class.
class SetupDescription extends Model
{
    constructor(detector, dye, excitation, ex_path, em_path) {
        super();
        this.detector = detector; // String or null
        this.dye = dye; // String or null
        this.excitation = excitation; // String or null
        this.ex_path = ex_path; // Array of {filter: String, mode: 'r'|'t'}
        this.em_path = em_path; // Array of {filter: String, mode: 'r'|'t'}
    }

    validate() {
        for (let name of ['detector', 'dye', 'excitation'])
            if (typeof(this[name]) !== 'string' && ! (x instanceof String)
                && this[name] !== null)
                return `${ name } must be a String or null`;

        for (let path_name of ['ex_path', 'em_path']) {
            const path = this[path_name];
            if (! (path instanceof Array))
                return `${ path_name } must be an Array`;

            for (let x of path) {
                if (typeof(x.filter) !== 'string' && ! (x.filter instanceof String))
                    return `values of ${ path_name } must have 'filter'`;
                if (x.mode !== 'r' && x.mode !== 't')
                    return `mode of '${ x.filter }' must be r or t`;
            }
        }
    }

    // Whether this instance describes the same Setup as other.
    //
    // Args:
    //     other(Setup|SetupDescription)
    isEqual(other) {
        if (other instanceof Setup)
            other = other.describe();

        if (this.detector !== other.detector
            || this.dye !== other.dye
            || this.excitation !== other.excitation
            || (! this.ex_path.isEqual(other.ex_path))
            || (! this.em_path.isEqual(other.em_path)))
            return false;

        return true;
    }

    toJSON(key) {
        // TODO: I can't really make sense of JSON.stringify
        //     documentation.  When called on the object being
        //     serialised, then 'key' will be an empty string.  I
        //     don't quite understand the other cases...

        const obj = {
            detector: this.detector,
            dye: this.dye,
            excitation: this.excitation,
            ex_path: this.ex_path,
            em_path: this.em_path,
        };
        return obj;
    }
}


// Handles the computation of the Setup efficiency, transmission, etc.
//
// It triggers change events for the detector, dye, excitation,
// ex_path, and em_path.  This is the model for what will eventually
// get displayed.  All user interactions get modelled into changes to
// an Setup instance.
//
// There is also an SetupDescription which does not have the actual
// Detector, Dye, Excitation, and Filter objects, instead it replaces
// them with their uids.
class Setup extends Model
{
    constructor() {
        super();
        // Adds a setter and getter for this properties, so it
        // triggers change events for all of them.
        const defaults = {
            detector: null,
            dye: null,
            excitation: null,
            // The filters are an array of Objects with filter and
            // mode keys.  We can't use a Map and the filter as key
            // because we may have the same filter multiple times.
            // 'filter' value is a Filter object. 'mode' value is a
            // char with value of 'r' or 't'.
            ex_path: new FilterStack,
            em_path: new FilterStack,
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

    // Scaled excitation
    get
    ex_transmission() {
        if (this.excitation === null)
            return null;
        else if (this.ex_path.length === 0)
            return this.excitation.intensity;
        else
            return this.ex_path.transmissionOf(this.excitation.intensity);
    }

    // Scaled dye emission
    get
    em_transmission() {
        if (this.dye === null)
            return null;
        else if (this.em_path.length === 0)
            return this.dye.emission;
        else
            return this.em_path.transmissionOf(this.dye.emission);
    }

    set
    ex_transmission(val) {
        throw new Error('Setup.ex_transmission is a read-only property');
    }

    set
    em_transmission(val) {
        throw new Error('Setup.em_transmission is a read-only property');
    }

    // Efficiency of the dye excitation, not of the excitation path.
    get
    ex_efficiency() {
        const source = this.excitation.intensity;
        const dye_ex = this.dye.absorption;

        const dye_ex_in_path = this.ex_path.transmissionOf(source).clone();
        dye_ex_in_path.data = dye_ex_in_path.multiplyBy(dye_ex);

        return dye_ex_in_path.area / source.area;
    }

    set
    ex_efficiency(val) {
        throw new Error('Setup.ex_efficiency is a read-only property');
    }

    get
    em_efficiency() {
        return this.em_path.efficiencyOf(this.dye.emission);
    }

    set
    em_efficiency(val) {
        throw new Error('Setup.em_efficiency is a read-only property');
    }

    // Describe this instance, i.e., replace the Filter, Dye, and
    // Excitation objects with their names.
    describe() {
        const description = new SetupDescription(
            this.detector ? this.detector.uid : null,
            this.dye ? this.dye.uid : null,
            this.excitation ? this.excitation.uid : null,
            this.ex_path.describe(),
            this.em_path.describe(),
        );
        if (! description.isValid())
            throw new Error(description.validation_error);
        return description;
    }

    empty() {
        this._detector = null;
        this._dye = null;
        this._excitation = null;
        this.ex_path._empty();
        this.em_path._empty();
        this.trigger('change');
    }

    // Relative brightness compared to Alexa-448 at 100% excitation.
    get
    brightness() {
        if (this.dye === null || this.excitation === null)
            throw new Error('no dye or excitation to compute brightness');

        if (this.dye.q_yield === null || this.dye.ex_coeff === null)
            return NaN;

        const bright = ((this.ex_efficiency * this.dye.q_yield
                         * this.dye.ex_coeff * this.em_efficiency)
                        / Dye.Alexa488_brightness);
        // multiply by 10 to give reasonable range of values?
        return bright * 10;
    }

    set
    brightness(val) {
        throw new Error('Setup.brightness is a read-only property');
    }

    clone() {
        const clone = new Setup();
        for (let p of ['detector', 'dye', 'excitation', 'ex_path', 'em_path'])
            clone[p] = this[p];
        return clone;
    }
}


// Pretty much a wrapper around Map to trigger events when it changes.
class Collection extends Model // also kind of a Map
{
    constructor(iterable) {
        super();
        this._map = new Map(iterable);
    }

    get
    size() {
        return this._map.size;
    }

    set
    size(val) {
        throw new Error('Collection.size is a read-only property');
    }

    clear() {
        this._map.clear();
        this.trigger('clear');
    }

    delete(key) {
        const deleted_something = this._map.delete(key);
        if (deleted_something)
            this.trigger('delete', key);
        return deleted_something;
    }

    entries() {
        return this._map.entries();
    }

    get(key) {
        return this._map.get(key);
    }

    has(key) {
        return this._map.has(key);
    }

    keys() {
        return this._map.keys();
    }

    set(key, value) {
        const event = this._map.has(key) ? 'change' : 'add';
        this._map.set(key, value);
        this.trigger(event, value);
    }

    values() {
        return this._map.values();
    }

    [Symbol.iterator]() {
        return this._map[Symbol.iterator]();
    }
}


// Like Collection for Filter, Detectors, Dyes, and Excitation.
//
// The elements of this collection will all be promises of our Data
// instances.  The reading of the data files is actually delayed until
// it is requested, hence it should be used like:
//
//    collection.get(uid).then(...)
//
// XXX: the first argument of the constructor is Array<key> instead of
//     Array<[key, val]> like the base classes Collection and Map.
//     This is weird and not great design.
//
// Args:
//     uids (Array<String>): these are expected to be filenames too
//       (without the .csv extension (lowercase)
//     datadir(String): directory where the files from uids will be
//     reader (function): will parse the text of a file and
//        return a Data object.  See Data.constructFromText.
class DataCollection extends Collection
{
    constructor(uids, datadir, reader) {
        // We can keep track of which ones have already been read,
        // because their value will be undefined.
        super(uids.map(x => [x, undefined]));
        this.datadir = datadir;
        this.reader = reader;
    }

    get(key) {
        // Also check if the key actually exists first, because get
        // returns undefined if not, and so we couldn't distinguish
        // between an invalid key and a not yet read value.
        if (this.has(key) && super.get(key) === undefined) {
            const fpath = this.datadir + key + '.csv';
            const value = $.ajax({
                url: fpath,
                dataType: 'text',
            }).then(text => this.reader(text, {'uid': key}));
            this._map.set(key, value);
        }
        return super.get(key);
    }

    // This methods would require reading all of the data files which
    // kinda defeats the purpose of this class.
    entries() {
        throw new Error('not a useful method for lazy loading');
    }
    values() {
        throw new Error('not a useful method for lazy loading');
    }
    [Symbol.iterator]() {
        throw new Error('not a useful method for lazy loading');
    }
}


// Base class for our views.
//
// Provides some pass-through methods to the jQuery element it
// controls.
//
// Args:
//     $el: jQuery instance with one element
class View
{
    constructor($el) {
        this.$el = $el;
    }

    on() {
        return this.$el.on(...arguments);
    }

    val() {
        return this.$el.val(...arguments);
    }

    $(selector) {
        return $(this.$el.find(selector));
    }

    render() {
        return this.$el.html(this.toHTML());
    }

    // Subclasses should overload this method which is called by render.
    toHTML() {
        throw new Error('toHTML method not implemented in View subclass');
    }
}

class CollectionView extends View
{
    constructor($el, collection) {
        super($el);
        this.collection = collection;
        for (let change of ['clear', 'delete', 'change', 'add'])
             this.collection.on(change, this.render, this);
    }

    toHTML() {
        const uids = Array.from(this.collection.keys());
        const html = uids.map(uid => this.itemHTML(uid));
        return html;
    }

    // Subclasses should overload this.
    itemHTML(uid) {
        return uid;
    }
}

// Displays a Collection as option lists in a select menu with an
// empty entry at the top.  Used to select a Setup, Detector, Dye, and
// Excitation.
class SelectView extends CollectionView
{
    constructor($el, collection) {
        super($el, collection);
        this._blank = this.itemHTML('');
    }

    toHTML() {
        // Prepend an empty string to the list of uids to be used as
        // selecting none.
        const options_html = super.toHTML();
        return [this._blank].concat(options_html);
    }

    // Append a new item to the View.  We append and we really do not
    // want to be sorting them.  This happens when a user imports a
    // new dye or saves a new setup, and we want them at the end so
    // it's easy to find them and distinguish from the default
    // options.
    append(uid, model) {
        this.$el.append(this.itemHTML(uid));
    }

    itemHTML(uid) {
        return `<option value="${ uid }">${ uid }</option>\n`;
    }
}


// Displays the elements in a Collection as list-group-item.  To view
// and not select.  Used to show the list of Filters available in the
// FilterStackBuilder GUI.
//
// TODO: special case for now, but we should be redoing the parent
//   classes to use nodes with the template
class CollectionViewB
{
    constructor(el, collection, template) {
        this._el = el;
        this._collection = collection;
        this._template = template;

        // TODO: the collection class should have a change event for
        // all that and the event object should then specify which of
        // this changes types actually happened.
        for (let change of ['clear', 'delete', 'change', 'add'])
            this._collection.on(change, this.render, this);
    }

    render() {
        this._el.textContent = '';
        for (let uid of this._collection.keys())
            this._el.appendChild(this.itemNode(uid));
        return this._el;
    }

    itemNode(uid) {
        const node = document.importNode(this._template, true);
        node.textContent = uid;
        node.ondragstart = this.handleDragStart;
        return node;
    }

    handleDragStart(ev) {
        ev.dataTransfer.setData('text', ev.target.textContent);
        ev.dataTransfer.effectAllowed = 'copy';
    }
}


// Displays a FilterStack, one of the two paths which compose a Setup.
class FilterStackView
{
    constructor(el, filterstack, template) {
        this._el = el;
        this._filterstack = filterstack;
        this._template = template;

        this._filterstack.on('change', this.render, this);
    }

    render() {
        this._el.textContent = '';
        for (let i = 0; i < this._filterstack.length; i++)
            this._el.appendChild(this.itemNode(i));
        return this._el;
    }

    // A Node for a filter in the filterstack.
    //
    // Args:
    //     i(Integer): index into the filterstack.  We need the index
    //         because we need unique names
    itemNode(i) {
        const uid = this._filterstack._stack[i].filter.uid;
        const mode = this._filterstack._stack[i].mode;

        const node = document.importNode(this._template, true);
        node.querySelector('span#filter-name').textContent = uid;

        // We have two labels, one for each radio button of
        // transmission and reflection.  Set one as the active, and
        // listen for a change on the other.
        const labels = node.querySelectorAll('label');

        // Bootstrap will change the 'active' class after user click.
        // However, we are also changing the style from btn-secondary
        // to btn-primary to have a slider look.
        const checked_i = mode === 't' ? 0 : 1;
        labels[checked_i].querySelector('input').checked = true;
        labels[checked_i].classList.remove('btn-secondary');
        labels[checked_i].classList.add('btn-primary', 'active');

        // Listen for changes on the unselected mode.
        const unchecked_i = checked_i === 0 ? 1 : 0;
        labels[unchecked_i].addEventListener(
            'click',
            this.toggleFilterMode.bind(this, i)
        );

        // We drag and drop filters from the filter collection into
        // the filter stack to add them.  We could drag filters out to
        // remove them.  While that would be nice, seems like it's
        // actually not that intuitive so we have a button.
        const close = node.querySelector('button.close');
        close.addEventListener('click', this.removeFilter.bind(this, i));

        node.ondragstart = this.handleDragStart;

        return node;
    }

    toggleFilterMode(i) {
        this._filterstack.toggleElemMode(i);
    }

    removeFilter(i) {
        this._filterstack.removeElem(i);
    }

    handleDragStart(ev) {
        ev.dataTransfer.setData('text', ev.target.textContent);
        ev.dataTransfer.dropEffect = 'move';
    }
}


// Controls the customisation of the FilterStack.
//
// There must be three ul elements inside $el with the following ids:
//    #filters
//    #ex-path
//    #em-path
//
// Args:
//     $el: jquery for the builder div
//     filters (DataCollection<Filter>):
//     setup (Setup):
class PathBuilder
{
    constructor(el, filters, setup) {
        this.el = el;
        this.filters = filters;
        this.setup = setup;

        const cols = {
            'filters': el.querySelector('#filters-view'),
            'ex_path': el.querySelector('#ex-path'),
            'em_path': el.querySelector('#em-path'),
        };

        const in_collection_template = this._li_template('collection-filters');
        const in_path_template = this._li_template('path-filters');
        this.views = {
            'filters': new CollectionViewB(cols.filters.querySelector('ul'),
                                           filters, in_collection_template),
            'ex_path': new FilterStackView(cols.ex_path.querySelector('ul'),
                                           setup.ex_path, in_path_template),
            'em_path': new FilterStackView(cols.em_path.querySelector('ul'),
                                           setup.em_path, in_path_template),
        };

        // The ondragover action is for the div with the column, not
        // for the list.  Otherwise we can't drop if the list is
        // empty.
        cols.ex_path.ondragover = this.handleDragOver.bind(this);
        cols.em_path.ondragover = this.handleDragOver.bind(this);

        cols.ex_path.ondrop = this.handleDrop.bind(this, 'ex_path');
        cols.em_path.ondrop = this.handleDrop.bind(this, 'em_path');
    }

    _li_template(id) {
        const template_node = this.el.querySelector(`template#${ id }`);
        return template_node.content.querySelector('li');
    }

    render() {
        for (let v of Object.values(this.views))
            v.render();
    }

    handleDragOver(ev) {
        const uid = ev.dataTransfer.getData('text');
        if (! this.filters.has(uid))
            return;

        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
    }

    handleDrop(path_name, ev) {
        ev.preventDefault();
        const uid = ev.dataTransfer.getData('text');
        const setup = this.setup;
        this.filters.get(uid).then(
            f => setup[path_name].push({'filter': f, 'mode': 't'})
        );
    }
}


class SetupPlot extends View
{
    constructor($el, setup) {
        super($el);
        this.setup = setup;
        this.plot = new Chart(this.$el[0].getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [],
            },
            options: {
                title: {
                    fontSize: 24,
                },
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

    // Convert Spectrum instance into a dataset model for Chartjs.
    //
    // Args:
    //     spectrum (Spectrum):
    //     options (Object): this will be added to the dataset object
    //         created from 'spectrum'.  It can also be used to
    //         override other options.  It is mainly used to set the
    //         label used.  It can also be used to change the colour.
    asChartjsDataset(spectrum, options = {}) {
        if (! this._dataset_cache.has(spectrum)) {
            const points = new Array(spectrum.wavelength.length);
            for (let i = 0; i < points.length; i++)
                points[i] = {x: spectrum.wavelength[i], y: spectrum.data[i]};
            // Convert a wavelength to HSL-alpha string.
            const hue = SetupPlot.wavelengthToHue(spectrum.peak_wavelength);

            const bg_colour = `hsla(${ hue }, 100%, 50%, 0.2)`;
            const line_colour = `hsla(${ hue }, 100%, 50%, 1)`;
            const chartjs_dataset = {
                data: points,
                backgroundColor: bg_colour,
                borderColor: line_colour,
                pointRadius: 0.0, // show the line only, not the datapoints
                borderWidth: 0.25,
            };
            this._dataset_cache.set(spectrum, chartjs_dataset);
        }
        const dataset = this._dataset_cache.get(spectrum);
        return Object.assign({}, dataset, options);
    }

    render() {
        const datasets = [];

        // We don't draw filters from the excitation path.  We don't
        // even have then hidden by default (which we could do by
        // passing {'hidden': true} in the dataset options.  This is
        // by design.  On the other hand, the spectrum of the
        // excitation spectrum will already appear scaled, so the
        // spectrum of the excitation will appear modelled in the
        // modified spectrum of the source.

        if (this.setup.detector !== null) {
            const detector = this.setup.detector;
            const options = {
                label: detector.uid,
            };
            datasets.push(this.asChartjsDataset(detector.qe, options));
        }

        for (let x of this.setup.em_path) {
            const mode = x.mode === 't' ? 'transmission' : 'reflection';
            const options = {
                label: `${ x.filter.uid } (${ x.mode })`
            };
            datasets.push(this.asChartjsDataset(x.filter[mode], options));
        }

        if (this.setup.excitation !== null) {
            // Excitation, together with Dye, is the thing that
            // matters the most to the user, so don't make it
            // transparent like the filters.
            const intensity = this.setup.excitation.intensity;
            const hue = SetupPlot.wavelengthToHue(intensity.peak_wavelength);
            const options = {
                label: this.setup.excitation.uid,
                backgroundColor: `hsla(${ hue }, 100%, 50%, 1)`,
                borderColor: `hsla(${ hue }, 100%, 50%, 1)`,
                borderWidth: 2.0,
            };
            // We don't display the spectrum of the excitation source,
            // we display the spectrum of the excitation source that
            // gets transmitted.
            const transmission = this.setup.ex_transmission;
            datasets.push(this.asChartjsDataset(transmission, options));
        }

        if (this.setup.dye !== null) {
            const dye = this.setup.dye;
            datasets.push(this.asChartjsDataset(dye.absorption,
                                                {label: dye.uid + '(abs)'}));
            datasets.push(this.asChartjsDataset(dye.emission,
                                                {label: dye.uid + '(em)'}));

            // If there are filters on the emission path, also show
            // the transmitted spectrum of the dye.  This is the thing
            // that users care the most so don't make it transparent
            // like the others, and make the border thicker and dark.
            if (this.setup.em_path.length !== 0) {
                const transmission = this.setup.em_transmission;
                const hue = SetupPlot.wavelengthToHue(transmission.peak_wavelength);
                const options = {
                    label: this.setup.dye.uid + '(transmitted)',
                    backgroundColor: `hsla(${ hue }, 100%, 50%, 1.0)`,
                    borderColor: 'rgba(0, 0, 0, 0.5)',
                    borderWidth: 2.0,
                };
                datasets.push(this.asChartjsDataset(transmission, options));
            }
        }

        // We use the title to place the efficiency values, so there's
        // no title if there's no dye.
        if (this.setup.dye === null)
            Object.assign(this.plot.options.title,
                          {display: false, text: ''});
        else
            Object.assign(this.plot.options.title,
                          this.formatTitle());

        // Reverse the datasets.  First elements appear on top of the
        // plot but we got this far expecting the other way around.
        // This is specially noticeable on the transmitted spectra
        // which will look kinda washed out if not plotted on top.
        this.plot.data.datasets = datasets.reverse();
        this.plot.update();
    }

    // Object to configure Chartjs title option.
    formatTitle() {
        const eff2str = (eff) => (eff*100).toFixed(1) + '%';

        // The things that will appear on the title.
        const info = [];

        if (this.setup.excitation !== null)
            info.push('ex=' + eff2str(this.setup.ex_efficiency));

        info.push('em=' + eff2str(this.setup.em_efficiency));

        if (this.setup.excitation !== null)
            info.push('brightness=' + this.setup.brightness.toFixed(2));

        const title = {
            display: true,
            text: `${ this.setup.dye.uid } efficiency: ${ info.join(', ') }`,
        };

        return title;
    }

    downloadLink(format='image/png') {
        return this.$el[0].toDataURL(format);
    }

    static
    wavelengthToHue(wavelength) {
        return Math.max(0.0, Math.min(300.0, 650.0 - wavelength)) * 0.96;
    }
}


class ImportDialog extends View
{
    constructor($el, options) {
        super($el);
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
            const attrs = {'uid': uid};
            try {
                const data = collection.factory(reader.result, attrs);
                collection.add(uid, data);
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


class SaveSetupDialog extends View
{
    constructor($el, setups, setup) {
        super($el);
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
                this.setups.set(uid, description);
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


class TestDyesDialog
{
    constructor(el, dyes, setup) {
        this.dyes = dyes;
        this.setup = setup;

        // Get the template for the rows and the individual table cells.
        const table = el.querySelector('table#test-dyes-results');
        this._tbody = table.querySelector('tbody');
        this._template = table.querySelector('template').content;
        this._th = this._template.querySelector('th');
        this._td = this._template.querySelectorAll('td');

        // An array of Object with the dye testing results, which will
        // then be used to render the table body.
        this._results = [];

        // Bootstrap uses jquery trigger() so we can't use
        // addEventListener(), we need to use jQuery's on()
        // https://stackoverflow.com/a/24212373
        const $el = $(el);
        $el.on('show.bs.modal', this.onShow.bind(this));
        $el.on('hidden.bs.modal', this.onHidden.bind(this));

        const thead_cells = table.querySelector('thead').querySelectorAll('th');
        thead_cells[1].onclick = this.renderTBody.bind(this, 'ex_eff');
        thead_cells[2].onclick = this.renderTBody.bind(this, 'em_eff');
        thead_cells[3].onclick = this.renderTBody.bind(this, 'bright');
    }

    onShow() {
        this._updateResults().then(this.renderTBody.bind(this, 'em_eff'));
    }

    onHidden() {
        this._tbody.textContent = '';
    }

    _updateResults() {
        // dye name to a two element array, the first the actusl
        // results while the second are the nodes to be inserted on
        // the table.  This is so we can later resort the table
        // without recomputing the nodes.
        this._results = [];

        // Prepare a clone of the live setup then test the different
        // dyes on it.
        const setup = this.setup.clone();
        const promises = [];
        for (let uid of this.dyes.keys()) {
            promises.push(
                this.dyes.get(uid).then((function(dye) {
                    setup.dye = dye;
                    const result = {
                        'uid': uid,
                        'ex_eff': setup.ex_efficiency,
                        'em_eff': setup.em_efficiency,
                        'bright': setup.brightness,
                    };

                    this._th.textContent = dye.uid;
                    this._td[0].textContent = result.ex_eff.toFixed(2);
                    this._td[1].textContent = result.em_eff.toFixed(2);
                    this._td[2].textContent = result.bright.toFixed(2);
                    result.node = document.importNode(this._template, true);

                    this._results.push(result);
                }).bind(this))
            );
        }
        return Promise.all(promises);
    }

    // Args:
    //     order(String): property name used to order the results
    //         table.  Must be a property on the 'results' Object.
    renderTBody(order) {
        this._tbody.textContent = ''; // remove all rows first

        // Beware of NaN values if we are sorting by brightness
        // because some dyes will be missing quantum yield and
        // extinction coefficient values.
        this._results.sort(function(a, b) {
            let cmp = b[order] - a[order];
            if (isNaN(cmp)) {
                if (isNaN(a[order]) && isNaN(b[order]))
                    cmp = 0.0;
                else if (isNaN(a[order]))
                    cmp = Infinity;
                else // isNaN(b[order])
                    cmp = -Infinity;
            }

            // For the sake of sorting stability, take a look at the
            // uids when the values are the same.
            if (cmp === 0.0)
                cmp = a.uid.localeCompare(b.uid);

            return cmp;
        });

        for (let result of this._results)
            this._tbody.appendChild(result.node.cloneNode(true));
    }
}


// The SpekCheck App / Controller
//
// Args:
//   $el: jquery div where the app will be created.
//   collections (Object): keys will be the 4 required collections and
//     their corresponding Collection instances.
class SpekCheck
{
    constructor($el, collections) {
        this.$el = $el;
        this.el = $el[0];
        this.collection = collections;
        for (let dtype of ['setup', 'detector', 'dye', 'excitation', 'filter'])
            if (! (collections[dtype] instanceof Collection))
                throw new Error(`no Collection for type '${ dtype }'`);

        // Changes are done to this instance of Setup which then
        // triggers the SetupPlot to update its display.
        this.live_setup = new Setup;
        this.plot = new SetupPlot(
            this.$el.find('#setup-plot'),
            this.live_setup,
        );

        // A button to save the plot
        this.$el.find('#save-plot-button').on('click',
                                              this.savePlot.bind(this));

        // Note that there's no SelectView for the filters.  Those are
        // not selectable, they're part of the path customisation GUI.
        this.view = {};
        for (let dtype of ['detector', 'dye', 'excitation', 'setup']) {
            const view = new SelectView(
                this.$el.find('#' + dtype + '-selector'),
                this.collection[dtype],
            );
            view.on('change', this.handleChangeEv.bind(this, dtype));
            view.render();
            this.view[dtype] = view;
        }

        this.path_builder = new PathBuilder(
            this.el.querySelector('#path-builder'),
            this.collection.filter,
            this.live_setup,
        );
        this.path_builder.render();

        // Setup description includes a Dye, the logic being that the
        // setup is often designed for it.  However, a user can also
        // be interested in inspecting different Setups for a specific
        // Dye in which case the Dye selection should remain fixed
        // when changing Setup.
        //
        // To support both cases, we keep track whether the current
        // Dye selection comes from manual choice.  If the last Dye
        // was manualy selected, changing preset Setups will not
        // trigger a change of Dye.
        this.user_selected_dye = false;

        this.save_setup_dialog = new SaveSetupDialog($('#save-setup-dialog'),
                                                     this.collection.setup,
                                                     this.live_setup);

        this.import_dialog = new ImportDialog($('#import-file-dialog'), {
            detector: this.collection.detector,
            dye: this.collection.dye,
            filter: this.collection.filter,
            excitation: this.collection.excitation,
        });

        this.test_dyes_dialog = new TestDyesDialog(
            this.$el[0].querySelector('#test-dyes-dialog'),
            this.collection.dye,
            this.live_setup
        );

        // If someone imports a Detector, Dye or Excitation, change to it.
        for (let dtype of ['detector', 'dye', 'excitation'])
            this.collection[dtype].on('add', this.changeData.bind(this, dtype));

        // Configure initial display based on the URL hash
        this.route(location.hash);
    }

    route(hash) {
        hash = decodeURIComponent(hash);
        for (let dir of ['#setup=', '#dye=', '#excitation=', '#detector=']) {
            if (hash.startsWith(dir)) {
                const cname = dir.slice(1, -1);
                const uid = hash.slice(dir.length);
                if (this.collection[cname].has(uid))
                    this.view[cname].$el.val(uid).change();
                break;
            }
        }
    }

    // Modify live_setup according to a new SetupDescription.
    //
    // Args:
    //     val (String): value displayed on the setup SelectView.
    //     setup (SetupDescription): may be null if user selects the
    //       empty setup on the SelectView.
    changeSetup(uid) {
        if (uid === null)
            return Promise.resolve(this.live_setup.empty());

        const setup = this.collection.setup.get(uid);
        const promises = [];

        // Only change dye if a user has not selected it manually.
        if (! this.user_selected_dye)
            promises.push(this.changeData('dye', setup.dye));

        promises.push(this.changeData('detector', setup.detector));
        promises.push(this.changeData('excitation', setup.excitation));

        for (let path_name of ['ex_path', 'em_path']) {
            const path = this.live_setup[path_name];
            // TODO: new replace method on path so that it can
            // identify if the change is small (or maybe none)
            path.empty();
            const filter_promises = [];
            for (let fpos of setup[path_name]) {
                filter_promises.push(
                    this.collection.filter.get(fpos.filter).then(
                        (f) => ({filter: f, mode: fpos.mode})
                    )
                );
            }
            promises.push(Promise.all(filter_promises).then(
                (filters) => path.push(...filters)
            ));
        }
        return promises;
    }

    changeData(dtype, uid) {
        const change = (function(data) {
            this.live_setup[dtype] = data;
            const val = uid === null ? '' : uid;
            this.view[dtype].val(val);
        }).bind(this);
        const log_failure = (function(reason) {
            console.error(`failed to get '${ dtype }' data:\n${ reason }`);
        });

        let get_data;
        if (uid === null)
            get_data = new Promise((r) => r(null));
        else
            get_data = this.collection[dtype].get(uid);
        return get_data.then(change).catch(log_failure);
    }

    handleChangeEv(dtype, ev) {
        const val = ev.target.value;
        const uid = val === '' ? null : val;
        if (dtype === 'setup') {
            location.hash = '#setup=' + encodeURIComponent(uid);
            return this.changeSetup(uid);
        } else {
            // Remember when a user selects a dye manually to prevent
            // changing it as part of changing setup.  Forget about
            // it, when a user unselects a dye.
            if (dtype === ' dye') {
                if (val === '')
                    this.user_selected_dye = false;
                else
                    this.user_selected_dye = true;
            }
            return this.changeData(dtype, uid);
        }
    }

    savePlot(ev) {
        // A useful name for the downloaded image.
        const setup_uid = this.view.setup.$el.val();
        const uid = setup_uid !== '' ? setup_uid : 'custom';
        ev.target.download = 'spekcheck-' + uid + '.png';

        ev.target.href = this.plot.downloadLink('image/png');
    }
}


// Configuration to use whole data from SpekCheck site.
//
// This can be passed to read_collections() if using the spekcheck
// database of data files.  Note the path which is relative to the
// SpekCheck site.
const spekcheck_db = {
    detector: {
        filepath: 'data/detectors.json',
        datadir: 'data/detectors/',
        reader: Detector.constructFromText.bind(Detector),
    },
    dye: {
        filepath: 'data/dyes.json',
        datadir: 'data/dyes/',
        reader: Dye.constructFromText.bind(Dye),
    },
    excitation: {
        filepath: 'data/excitation.json',
        datadir: 'data/excitation/',
        reader: Excitation.constructFromText.bind(Excitation),
    },
    filter: {
        filepath: 'data/filters.json',
        datadir: 'data/filters/',
        reader: Filter.constructFromText.bind(Filter),
    },
    setup: {
        filepath: 'data/setups.json',
    },
};

// Returns a promise of an Object with the collections.
//
// Args:
//     db (Object): keys are the individual collections that will be
//         created.  See the spekcheck_db variable.
//
// Returns:
//     A promise of the collections Object that can be passed to
//     construct SpekCheck.
function read_collections(db)
{
    const collections = {};
    const promises = [];  // promises that the individual collections are ready

    // Collection of SetupDescription is simpler.
    promises.push($.ajax({
        url: db.setup.filepath,
        dataType: 'json',
    }).then(
        function(data) {
            collections.setup = new Collection(data);
        },
    ));

    for (let dtype of ['detector', 'dye', 'excitation', 'filter']) {
        promises.push($.ajax({
            url: db[dtype].filepath,
            dataType: 'json',
        }).then(
            // data should be an Array of String, the uids
            function(data) {
                collections[dtype] = new DataCollection(
                    data,
                    db[dtype].datadir,
                    db[dtype].reader,
                );
            },
            // Not sure how we can handle a failure here.  We could
            // create an empty collection but that's not actually very
            // useful.
        ));
    }
    return Promise.all(promises).then(
        () => collections,
        (reason) => {new Error('failed to read collection: ' + reason)},
    );
}


// Initialise SpekCheck program.
//
// Args:
//     el (Element): the element where the SpekCheck program will be
//         created.
//     url (String): URL for a HTML file which will be inserted into
//         'el' before starting the program.
//     db (Object): controls the collections to be used.
//
// This allows other sites to insert SpekCheck in any div they want,
// while still controlling the collections and without having to
// duplicate the whole HTML.
function main(el=document.querySelector('#spekcheck'),
              url='templates/spekcheck.html',
              db=spekcheck_db)
{
    // Insert the spekcheck html before everything else.
    const injected = $.ajax({
        'url': url,
        'dataType': 'html',
    }).then((data) => el.innerHTML = data);

    read_collections(spekcheck_db).then(function(collections) {
        injected.then(
            () => new SpekCheck($(el), collections));
    });
    return 0;
}
