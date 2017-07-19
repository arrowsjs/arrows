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

A JavaScript function can be *lifted* into an arrow. This can be done either by creating
a `LiftedArrow`, or calling the `lift` function.

```javascript
var a = new LiftedArrow(fn);
var b = fn.lift();
```

Multiple arrows can be composed together to build a state machine that will respond to
external events (user interacting with a webpage, a remote server response, a timer or
interval expiring, etc). Once a state machine is built, it can be run - it does not
execute implicitly.

Calling the `run` method on an arrow will return a *progress object*. Each invocation
will return a new progress object. The execution of an arrow can be stopped by calling
the `cancel` method on the progress object.

```javascript
var p = arrow.run();
p.cancel();
```

Notice that the call to `cancel` in the example above will only be reached once the
arrow reaches a point where it is blocked by an external event. Arrows can only be
canceled at asynchronous points.

---

### Typechecking

Arrows are bundled with an optional typesystem. Each arrow carries its own type, and
composing two arrows will fail if the types clash. This helps discover errors which
are particularly hard to debug in this style of programming much earlier.

Built-in arrows have already been given a type. The type of a arrow resulting from a
combinator has its type inferred and does not require anything from the user.

Lifted functions must be *annotated* with a type. This is done by adding a comment in
the lifted function of the following form. The type of an arrow requires, at a minimum,
the input type and the return type.

```javascript
var arr = function(a, b, c) {
    /* @arrow :: (Bool, Number, Number) ~> Number */
    return a ? b * c : b + c;
}
```

The types which can be used are given below.

Type                    | Description
----                    | -----------
`'a`, `'b`, `'c`        | A type variable
`_`                     | A value which cannot be used meaningfully (null, undefined)
`T1+T2`                 | A value of type T1 or T2
`[T]`                   | An array with elements of type T
`(T1, T2, ...)`         | A fixed-size array whose ith element has type T(i)
`{l1: T1, l2: T2, ...}` | An object whose field l(i) has type T(i)
`<l1: T1, l2: T2, ...>` | A special object with a tag and a wrapped value; if the tag is l(i), then the value has type T(i)

The built-in types `String`, `Bool`, `Number`, `Elem`, and `Event` are also supported.
Additional user-defined types can be used by name (e.g. `User` or `Post`). Such types
are treated opaquely by the type checker and will not check the fields of the object.

A **tagged** value can be created in the following way. A tagged value can be queried
for its tag (e.g. `v.hasTag("foo")`) and can unwrap its value (e.g. `v.value()`).

```javascript
var arr = function(i) {
    /* @arrow :: Number ~> <foo: String, bar: Int, baz: _> */
    if (i % 2 == 0) { return new TaggedValue("foo", "" + i); }
    if (i % 3 == 0) { return new TaggedValue("bar", i * 27); }
    else            { return new TaggedValue("baz"); }
}
```

If a lifted function does not have an annotation it is assumed to be `_ ~> _`.

A type may also have a set of **constraints** and a set of **exception types**. If the
user supplies them, then they are annotated in the following form.

```javascript
var arr = function(x, y) {
    /* @arrow :: ('a, 'a) ~> 'b \ ({'a <= Number+String, 'b <= 'a}, {MathError}) */
    if (x == 42) { throw new MathError('Forbidden value for x.'); }
    else         { return x + y; }
}
```

In this example, the constraint set contains the constraint `'a <= Number+String` stating
that the type variable `'a` must be a subtype of `Number` or `String`, and the constraint
`'b <= 'a` stating that the return value must be a subtype of the input. The function may
also throw a value of type `MathError`.

Constraints are often unnecessary to annotate by hand, but frequently occur in the inferred
type of a combinator. Combining two arrows do not requires the types to match **exactly**,
but does requires that an arrow consuming a value from another arrow expect a supertype (a
less specific type) of the annotated return value. For example, the following composition
is legal.

```javascript
var arr1 = (function() {
    /** @arrow :: _ ~> (Number, String, Bool) */
    return [10, "foo", false];
}).lift();

var arr2 = (function(a, b) {
    /** @arrow :: (Number, 'a) ~> 'a */
    return b;
}).lift();

arr1.seq(arr2); // Inferred type is (Number, String, Bool) ~> String
```

---

### Builtins

#### Elem

The Elem arrow returns the *current* set of elements matching the selector supplied at
construction. The value returned is a jQuery object, not a raw DOM object. This arrow
ignores its input. This arrow is synchronous.

```javascript
var elem1 = new ElemArrow('#byIdent');
var elem2 = new ElemArrow('.byClass');
```

#### Event

The Event arrow takes an element as input and registers an event handler for the event
type supplied at construction. The arrow will resume execution once the event occurs,
returning the event object. This arrow is asynchronous.

```javascript
Arrow.seq([new ElemArrow('#byIdent'), new EventArrow('click')]); // Fires after object with ID is clicked
Arrow.seq([new ElemArrow('#byClass'), new EventArrow('click')]); // Fires after any object with class is clicked
```

#### Delay

The Delay arrow will pause execution of the arrow for a number of milliseconds supplied
at construction. This arrow returns its input unchanged. This arrow is asynchronous.

```javascript
Arrow.seq([
    printHello,
    new DelayArrow(5000), // Pause for 5 second
    printWorld
]);
```

#### Ajax

The Ajax arrow makes a remote request and returns the response body. This arrow must be
supplied a configuration function as construction time. This arrow is asynchronous. When
executed, the arrow will pass the input to the configuration function which is expected
to return an object of Ajax options. For documentation on available options, see the
[jQuery docs](http://api.jquery.com/jquery.ajax/)). The return value will be formatted
according to the `dataType` option.

The configuration function must be annotated with two types: the expected input of the
configuration function, and the expected response from the server. Similarly to lifted
functions, this is done by adding a comment of the following form.

```javascript
var ajax = new AjaxArrow(function(searchTerm) {
    /**
     * @conf :: String
     * @resp :: [{name: String, price: Number}]
     */
    return {
        'url': 'http://api.com/items?q=' + searchTerm,
        'dataType': 'json'
    };
});

Arrow.seq([ajax, displayResponse]);
```

#### Split

The Split arrow will clone its input *n* times and output a *n*-tuple. The value *n* is
supplied at construction. This is often useful when several arrows running concurrently
should begin executing with the same input. This arrow is synchronous.

```javascript
Arrow.seq([new SplitArrow(3), Arrow.all([arrow1, arrow2, arrow3])]); // Arrows given same input
```

#### Nth

The Nth arrow will return the *n*th element from a *k*-tuple where *k* no less than *n*.
The value *n* is supplied at construction and is one-indexed (one, not zero, refers to the
first element of a tuple). This arrow is synchronous.

```javascript
Arrow.seq([Arrow.all([arrow1, arrow2, arrow3]), new NthArrow(2)]); // Extract arrow2's output
```

---

### Combinators

#### Seq

The Seq combinator will use the output of one arrow as the input of another. Many arrows
can be sequenced together at once. If one arrow in the chain is asynchronous, the execution
of the chain will block.

```javascript
Arrow.seq([arrow1, arrow2, arrow3]); // Pass arrow1's output to arrow2,
                                     // then arrow2's output to arrow3
```

#### All

The All combinator sequences multiple arrows in parallel. Both the input and output of
the resulting arrow are tuples, where each item of the tuple corresponds to one of the
sub-arrows.

The arrows will begin to execute in-order. If an asynchronous arrow is executed, the
next arrow in the chain will begin to execute *immediately*. The resulting arrow will
block until all arrows have completed.

```javascript
Arrow.all([click1, click2, click3]); // Takes three elements, returns three clicks
```

#### Any

Like the All combinator, the Any combinator sequences multiple arrows in parallel; unlike
the All combinator, the Any combinator will allow only one branch of execution to complete.

Each arrow used as input to the Any combinator must be asynchronous (at some point during
its execution). The arrows will begin to execute in-order. Each arrow will be partially
executed and waiting for an external event (user click, timer, Ajax response). The first
arrow to resume execution will be allowed to complete, and the event listeners in all the
other branches will be removed. This arrow returns the result of the branch that resumed
execution.

The input to the resulting arrow will be fed to each sub-arrow (that is, each arrow gets
a copy of the same input). The resulting arrow is asynchronous.

```javascript
Arrow.any([ajaxServer1, ajaxServer2, ajaxServer3]); // The result will be the response of
                                                    // the fastest server
```

#### NoEmit

The NoEmit combinator wraps a single arrow so that any progress made within the arrow
will not cause the cancellation of another branch running concurrently with the any
combinator.

The NoEmit combinator **forces** progress to be made at the end of execution. Therefore,
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

The Try combinator is constructed with a *protected* arrow, a *success* arrow, and an
*error handler*. If an exception is thrown within the protected arrow, then the error
handler is executed. Otherwise, the protected and success arrows behave as if they were
sequenced.

If an error is thrown from within the success arrow, the error handler will **not** be
invoked. For safety within the success arrow or the error handler, the arrow must be
nested within another Try combinator.

```javascript
Arrow.try(ajax, handle, displayError); // If the Ajax request fails, display an error
```

For the arrow to type check, the error handler must accept *at least* the types which
can be thrown from the protected arrow. It is not possible for an exception value to
**leak** from the protected arrow past the boundary of the Try combinator.

#### Fix

The Fix-point combinator constructs an arrow which can refer to itself. This is useful
for loops and sequencing repetitive actions. The combinator takes an arrow builder
function as input. The input to this function is an arrow which acts as a reference to
the arrow being built. The function must return an arrow.

```javascript
Arrow.fix(function(a) {
    return Arrow.seq([work, new DelayArrow(25), a]); // Infinitely invoke work with 25ms breaks
});
```

*Caution:* It is possible to create an arrow which is well-composed and well-typed, but
will recursive infinitely in a non-useful way. For example, the following arrow will
never execute the `print` function, as it always begins to execute itself from the
beginning immediately.

```javascript
Arrow.fix(function(a) {
    return Arrow.seq([a, new DelayArrow(25), print]);
});
```

## API

The following static methods create the combinators described above.

- `Arrow.seq([a1, a2, ...])`
- `Arrow.all([a1, a2, ...])`
- `Arrow.any([a1, a2, ...])`
- `Arrow.try([pa, sa, err])`
- `Arrow.noemit(a)`

In addition, the following static methods create derived combinators.

- `Arrow.fanout([a1, a2, ...])` creates a combinator similar to All which feeds a copy
  of the the same input to each arrow.
- `Arrow.bind(event, a)` creates an arrow which takes an Elem as input, and invokes `a`
  with an input of `(Elem, Event)` after the event occurs.

Each arrow also carries the following methods to create the combinators described above.

- `a.noemit()`
- `a1.seq(a2, ...)`
- `a1.all(a2, ...)`
- `a1.any(a2, ...)`
- `pa.try(sa, err)`

In addition, arrows carry the following methods to create derived combinators.

- `a.wait(duration)` will add a Delay arrow after the execution of `a`.
- `a.after(duration)` will add a Delay arrow before the execution of `a`.
- `a.triggeredBy(selector, event)` will invoke `a` once the event occurs on the selector.
  This does not change the input to `a`, only the conditions under which it is invoked.
- `a.catch(err)` creates a Try combinator with an identity success arrow.
- `a.split(n)` will add a Split arrow after the execution of `a`.
- `a.nth(n)` will add an Nth arrow after the execution of `a`.
- `a.tap(f1, f2, ...)` will sequence a series of functions or arrows together such that
  each step receives the output of `a` as its argument, and returns the output of `a` at
  the end of the sequence.
- `a.on(event, handler)` assumes `a` is an arrow returning an Elem, waits for the event
  to occur on that value, then invokes `handler` arrow with a `(Elem, Event)` argument.
- `a.remember()` will execute `a`, then return the original input to the arrow.
- `a.carry()` will execute `a`, then return a tuple containing both the original input
  and the output of `a`.
- `a.repeat()` will assume the return value of `a` is of type `<loop: 'a, halt: 'b>`. If
  `a` returns a loop tag, then `a` is re-invoked with its unwrapped output value as its
  new input. Otherwise, the arrow halts with the unwrapped value.
- `a.times(n)` will execute `a` with the same input `n` times (where `n` > 0). The value
  resulting from this arrow is the _last_ output of `a`.
- `a.forever()` will re-invoke `a` forever in a loop.
- `a.whileTrue()` will invoke `a` with the same input until `a` returns non-true. Once
  repetition stops, the arrow returns no useful value.

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
