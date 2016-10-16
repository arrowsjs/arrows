# Arrows

The Arrows library provides methods for composing asynchronous functions in JavaScript.

An arrow can be viewed as a simple wrapper around a JavaScript function. Internally, when
a function is lifted into an arrow it is converted into
[Continuation Passing Style](https://en.wikipedia.org/wiki/Continuation-passing_style).
This allows the composition of both synchronous and asynchronous arrows to use the same
syntax - all callback functions are invisible to the user.

For literature and examples, see the [Project Homepage](http://arrows.eric-fritz.com).

## Usage

### Lifting, Running, and Cancellation

todo

### Typechecking

todo

### Builtins

#### ElemArrow('selector')

todo

#### AjaxArrow(confFn)

todo

#### EventArrow('name')

todo

#### DelayArrow(milliseconds)

todo

#### SplitArrow(n)

todo

#### NthArrow(n)

todo

### Combinators

#### Seq

todo

#### All

todo

#### Any

todo

#### NoEmit

todo

#### Try

todo

#### Fix

todo

## License

Copyright (c) 2016 Eric Fritz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
