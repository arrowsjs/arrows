#!/bin/bash -ex

# Generate parser
jison src/grammar.jison -o arrows.js

# Append remaining source files
cat src/arrows.js >> arrows.js
cat src/builtins.js >> arrows.js
cat src/combinators.js >> arrows.js
cat src/types.js >> arrows.js
cat src/typechecker.js >> arrows.js
cat src/util.js >> arrows.js

# Create version compatible with ES5
babel arrows.js -o arrows.es5.js

# Minify the ES5 version
uglifyjs arrows.es5.js -o arrows.min.js
