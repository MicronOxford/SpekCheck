#!/bin/bash
#  * Spectral Transmission tool
#  *
#  * Copyright 2017 Mick Phillips (mick.phillips@gmail.com)
#  * and Ian Dobbie (ian.dobbie@gmail.com)
#  *
#  * This program is free software: you can redistribute it and/or modify
#  * it under the terms of the GNU General Public License as published by
#  * the Free Software Foundation, either version 3 of the License, or
#  * (at your option) any later version.
#  *
#  * This program is distributed in the hope that it will be useful,
#  * but WITHOUT ANY WARRANTY; without even the implied warranty of
#  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  * GNU General Public License for more details.
#  *
#  * You should have received a copy of the GNU General Public License
#  * along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# Shell script to update the dye, filter and excitation index files.
#

# loop over dyes, filters and excitation directories
for dirname in dyes filters excitation; do
    dirpath=data/$dirname
    ls $dirpath | sort | grep -v 'index.html' > "$dirpath/index.html"
    echo "updated $dirname"
done
