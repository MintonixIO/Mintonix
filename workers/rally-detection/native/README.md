# Court fitter provenance

The C++ sources were copied from the user-supplied
`Mintonix-Archive/Mintonix-Pose-Improv/lib/court-detection` directory. The line
candidate, court model, and fitting algorithms are retained. The entry point
requires explicit video/output arguments, does not open windows, and seeds
fitting deterministically. CMake builds against host OpenCV; conditional
geometry includes support OpenCV 5 as well as the container's OpenCV 4.

Do not check archived executables or weights into this directory.
