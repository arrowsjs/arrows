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

---

### Typechecking

todo

### Builtins

---

#### Elem

The Elem arrow returns the *current* set of elements matching the selector supplied at
construction. The value returned is a jQuery object, not a raw DOM object. This arrow
ignores its input. This arrow is synchronous.

#### Event

The Event arrow takes an element as input and registers an event handler for the event
type supplied at construction. The arrow will resume execution once the event occurs,
returning the event object. This arrow is asynchronous.

```javascript
var elem1 = new ElemArrow('#byIdent');
var elem2 = new ElemArrow('.byClass');

elem1.seq(new EventArrow('click')); // Fires after object with ID is clicked
elem2.seq(new EventArorw('click')); // Fires after any object with class is clicked
```

#### Delay

The Delay arrow will pause execution of the arrow for a number of milliseconds supplied
at construction. This arrow returns its input unchanged. This arrow is asynchronous.

```javascript
printHello.seq(new DelayArrow(5000)).seq(printWorld);
```

#### Ajax

The Ajax arrow makes a remote request and returns the response body. This arrow must be
supplied a configuration function as construction time. This arrow is asynchronous. When
executed, the arrow will pass the input to the configuration function which is expected
to return an object of Ajax options. For documentation on available options, see the
[jQuery docs](http://api.jquery.com/jquery.ajax/)). The return value will be formatted
according to the `dataType` option.

**TODO** - talk about type annotation

```javascript
var ajax = new AjaxArrow(function(searchTerm) {
    return {
        'url': 'http://api.com/search/' + searchTerm,
        'dataType': 'json'
    };
});

ajax.seq(handleJson);
```

#### Split

The Split arrow will clone its input *n* times and output a *n*-tuple. The value *n* is
supplied at construction. This is often useful when several arrows running concurrently
should begin executing with the same input. This arrow is synchronous.

```javascript
new SplitArrow(3).seq(Arrow.all([arrow1, arrow2, arrow3])); // Arrows given same input
```

#### Nth

The Nth arrow will return the *n*th element from a *k*-tuple where *k* no less than *n*.
The value *n* is supplied at construction and is one-indexed (one, not zero, refers to the
first element of a tuple). This arrow is synchronous.

```javascript
Arrow.all([arrow1, arrow2, arrow3]).seq(new NthArrow(2)); // Extract arrow2's output
```

### Combinators

---

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
