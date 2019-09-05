#!/usr/bin/env python
# -*- coding: utf-8 -*-

## Copyright (C) 2011 William Krekeler <WKrekeler@cleanearthtech.com>
## Copyright (C) 2012-2107 Carnë Draug <carandraug+dev@gmail.com>
##
## SpekCheck is free software: you can redistribute it and/or modify
## it under the terms of the GNU General Public License as published by
## the Free Software Foundation, either version 3 of the License, or
## (at your option) any later version.
##
## SpekCheck is distributed in the hope that it will be useful,
## but WITHOUT ANY WARRANTY; without even the implied warranty of
## MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
## GNU General Public License for more details.
##
## You should have received a copy of the GNU General Public License
## along with SpekCheck.  If not, see <http://www.gnu.org/licenses/>.

## This code is based on the function wavelength2rgb part of the
## Octave image package released under GPLv3+, hence the copyright to
## William Krekeler, and had the following references:
##
## http://stackoverflow.com/questions/2374959/algorithm-to-convert-any-positive-integer-to-an-rgb-value
## http://www.midnightkite.com/color.html per Dan Bruton

import sys

import numpy
import scipy.misc

def wavelength2rgb(nm, gamma=0.8):
    if nm.ndim == 1:
        nm = nm.reshape((1, nm.size))
    elif nm.ndim > 2:
        raise RuntimeError('NM has more than 2 dimensions')
    rgb = numpy.zeros(list(nm.shape) + [3])

    ## Because rgb starts filled zeros, there's no need to assign some
    ## values.  They are commented out below to make it explicit that
    ## they were not forgotten.

    mask = (nm >= 380) & (nm < 440)
    rgb[mask, 0] = - (nm[mask] - 440) / 60.0
    # rgb[mask, 1] = 0.0
    rgb[mask, 2] = 1.0

    mask = (nm >= 440) & (nm < 490)
    # rgb[mask, 0] = 0.0
    rgb[mask, 1] = (nm[mask] - 440) / 50.0
    rgb[mask, 2] = 1.0

    mask = (nm >= 490) & (nm < 510)
    # rgb[mask, 0] = 0.0
    rgb[mask, 1] = 1.0
    rgb[mask, 2] = -(nm[mask] - 510) / 20.0

    mask = (nm >= 510) & (nm < 580)
    rgb[mask, 0] = (nm[mask] - 510) / 70.0
    rgb[mask, 1] = 1.0
    # rgb[mask, 2] = 0.0

    mask = (nm >= 580) & (nm < 645)
    rgb[mask, 0] = 1.0
    rgb[mask, 1] = -(nm[mask] - 645) / 65.0
    # rgb[mask, 2] = 0.0

    mask = (nm >= 645) & (nm < 780)
    rgb[mask, 0] = 1.0
    # rgb[mask, 1] = 0.0
    # rgb[mask, 2] = 0.0

    ## let intensity fall off near the vision limits
    factor = numpy.ones(nm.shape)
    mask = (nm >= 380) & (nm < 420)
    factor[mask] = 0.3 + 0.7 * (nm[mask] - 380) / 40.0
    mask = (nm > 700) & (nm <= 780)
    factor[mask] = 0.3 + 0.7 * (780 - nm[mask]) / 80.0

    factor = factor.reshape(list(factor.shape) + [1])

    rgb *= factor
    rgb **= gamma
    return rgb

def main(fname):
    ## Array with the visible wavelength range
    nm = numpy.array(range(380, 780))
    rgb = wavelength2rgb(nm)
    scipy.misc.imsave(fname, rgb)


if __name__ == "__main__":
    main(*sys.argv[1:])
