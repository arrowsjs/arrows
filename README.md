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

**TODO**

---

### Typechecking

**TODO**

---

### Builtins

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

---

### Combinators

#### Seq

The sequencing combinator will use the output of one arrow as the input of another. Many
arrows can be sequenced together at once. If one arrow in the chain is asynchronous, the
execution of the chain will block.

```javascript
Arrow.seq([arrow1, arrow2, arrow3]); // Pass arrow1's output to arrow2,
                                     // then arrow2's output to arrow3
```

#### All

The all combinator sequences multiple arrows in parallel. Both the input and output of
the resulting arrow are tuples, where each item of the tuple corresponds to one of the
sub-arrows.

The arrows will begin to execute in-order. If an asynchronous arrow is executed, the
next arrow in the chain will begin to execute *immediately*. The resulting arrow will
block until all arrows have completed.

```javascript
Arrow.all([click1, click2, click3]); // Takes three elements, returns three clicks
```

#### Any

Like the all combinator, the any combinator sequences multiple arrows in parallel; unlike
the all combinator, the any combinator will allow only one branch of execution to complete.

Each arrow used as input to the any combinator must be asynchronous (at some point during
its execution). The arrows will begin to execute in-order. Each arrow will be partially
executed and waiting for an external event (user click, timer, Ajax response). The first
arrow to resume execution will be allowed to complete, and the event listeners in all the
other branches will be removed. This arrow returns the result of the branch that resumed
execution.

The input to the resulting arrow will be fed to each sub-arrow. The resulting arrow is
asynchronous.

```javascript
Arrow.any([ajaxServer1, ajaxServer2, ajaxServer3]); // The result will be the response of
                                                    // the fastest server
```

#### NoEmit

The noemit combinator wraps a single arrow so that any progress made within the arrow
will not cause the cancellation of another branch running concurrently with the any
combinator.

The noemit combinator **forces** progress to be made at the end of execution. Therefore,
the resulting arrow is asynchronous, regardless if the wrapped arrow was asynchronous or
not.

```javascript
var a1 = Arrow.any([
    new DelayArrow(5000),
    Arrow.all([click1, click2, click3])
]);

var a2 = Arrow.any([
    new DelayArrow(5000),
    Arrow.all([click1, click2, click3]).noemit()
]);

a1.run(); // Timer is canceled by clicking one element
a2.run(); // Timer is canceled by clicking all three elements
```

#### Try

The try combinator is constructed with a *protected* arrow, a *success* arrow, and an
*error handler*. If an exception is thrown within the protected arrow, then the error
handler is executed. Otherwise, the protected and success arrows behave as if they were
sequenced.

If an error is thrown from within the success arrow, the error handler will **not** be
invoked. For safety within the success arrow or the error handler, the arrow must be
nested within another try combinator.

**TODO** - talk about required type of handler

```javascript
Arrow.try(ajax, handle, displayError); // If the Ajax request fails, display an error
```

#### Fix

The fix-point combinator constructs an arrow which can refer to itself. This is useful
for loops and sequencing repetitive actions. The combinator takes an arrow builder
function as input. The input to this function is an arrow which acts as a reference to
the arrow being built. The function must return an arrow.

```javascript
Arrow.fix(function(a) {
    return work.lift().wait(25).seq(a); // Infinitely invoke work with 25ms breaks
});
```

*Caution:* It is possible to create an arrow which is well-composed and well-typed, but
will recursive infinitely in a non-useful way. For example, the following arrow will
never execute the `print` function, as it always begins to execute itself from the
beginning immediately.

```javascript
Arrow.fix(function(a) {
    return a.seq(print.lift()).after(25);
});
```

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
