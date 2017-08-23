var numarrows = 0;
var numannotations = 0;
var annotationParseTime = 0;

var typechecks = 0;
var typecheckTime = 0;

var started;
var typecheck = true;
var benchmark = false;
var displaychecks = false;

function _benchmarkStart(shouldTypecheck) {
    benchmark = true;
    typecheck = shouldTypecheck;

    started = window.performance.now();
}

function _benchmarkResultsOrRun(/* ...arrows */) {
    if (benchmark) {
        let elapsed = window.performance.now() - started;

        console.log('Arrows: ' + numarrows);
        console.log('Num annotations: ' + numannotations);
        console.log('Composition time: ' + elapsed + ' (' + annotationParseTime + ')');
    } else {
        for (var i = 0; i < arguments.length; i++) {
            arguments[i].run();
        }
    }
}

function _construct(f) {
    if (typecheck) {
        return f();
    } else {
        return new ArrowType(new TopType(), new TopType());
    }
}

function _check(type, value) {
    if (typecheck) {
        let start = window.performance.now();

        type.check(value);

        let elapsed = window.performance.now() - start;
        typechecks++;
        typecheckTime += elapsed;

        if (displaychecks) {
            console.log(typechecks + ' checks, ' + typecheckTime + 'ms');
        }
    }
}

Array.create = function(length, value) {
    var arr = [];
    while (--length >= 0) {
        arr.push(value);
    }

    return arr;
}

Array.copy = function(array) {
    return [].slice.call(array);
}

Array.prototype.unique = function() {
    return this.filter((v, i, s) => s.indexOf(v) === i);
}

Function.prototype.lift = function() {
  return new LiftedArrow(this);
}

Number.prototype.lift = function() {
    var value = this.valueOf();

    return new LiftedArrow(function() {
        /* @arrow :: _ ~> Number */
        return value;
    });
}

Boolean.prototype.lift = function() {
    var value = this.valueOf();

    return new LiftedArrow(function() {
        /* @arrow : _ ~> Bool */
        return value;
    });
}

class Arrow {
    constructor(type) {
        numarrows++;
        this.type = type;
    }

    call(x, p, k, h) {
        throw new Error('Call undefined')
    }

    equals(that) {
        throw new Error('Equals undefined')
    }

    isAsync() {
        return false;
    }

    run() {
        if (!(this.type.arg instanceof TopType)) {
            throw new Error('Cannot run an arrow that takes arguments')
        }

        var p = new Progress(true);
        this.call(null, p, () => {}, err => { throw err; });
        return p;
    }

    // Combinator constructors

    noemit() {
        return Arrow.noemit(this);
    }

    seq(/* ...arrows */) {
        return Arrow.seq([this].concat(Array.copy(arguments)));
    }

    any(/* ...arrows */) {
        return Arrow.any([this].concat(Array.copy(arguments)));
    }

    all(/* ...arrows */) {
        return Arrow.all([this].concat(Array.copy(arguments)));
    }

    try(success, failure) {
        return Arrow.try(this, success, failure);
    }

    // Convenience API

    named(name) {
        return new NamedArrow(name, this);
    }

    lift() {
        return this;
    }

    wait(duration) {
        return this.seq(new DelayArrow(duration));
    }

    after(duration) {
        return new DelayArrow(duration).seq(this);
    }

    triggeredBy(selector, event) {
        return new ElemArrow(selector).seq(new EventArrow(event)).remember().seq(this);
    }

    then(success, failure) {
        if (failure === undefined) {
            return this.seq(success);
        } else {
            return this.try(success, failure);
        }
    }

    catch(failure) {
        return this.then(Arrow.id(), failure);
    }

    // Data Routing

    split(n) {
        return this.seq(new SplitArrow(n));
    }

    nth(n) {
        return this.seq(new NthArrow(n));
    }

    fanout(/* ...arrows */) {
        return Arrow.fanout([this].concat(Array.copy(arguments)));
    }

    tap(/* ...functions */) {
        var sec = getNonNull(Array.copy(arguments)).map(a => a.lift());
        var all = [this].concat(sec);
        var rem = [this].concat(sec.map(a => a.remember()));

        return new NamedArrow('tap(' + all.map(a => a.toString()).join(', ' ) + ')', Arrow.seq(rem));
    }

    on(name, handler) {
        return new NamedArrow('on(' + name + ', {0})', this.seq(new SplitArrow(2), Arrow.id().all(new EventArrow(name)), handler), [handler]);
    }

    remember() {
        return new NamedArrow('remember({0})', this.carry().nth(1), [this]);
    }

    carry() {
        return new NamedArrow('carry({0})', new SplitArrow(2).seq(Arrow.id().all(this)), [this]);
    }

    // Repeating

    repeat() {
        return new NamedArrow('repeat({0})', Arrow.fix(a => this.wait(0).seq(Arrow.try(Arrow.repeatTail(), a, Arrow.id()))), [this]);
    }

    times(n) {
        let init = new LiftedArrow(function() {
            /* @arrow :: _ ~> Number */
            return n;
        });

        let rep = new LiftedArrow((n, x, y) => {
            /* @arrow :: (Number, 'a, 'b) ~> <loop: (Number, 'a, 'a), halt: 'b> */
            return n > 1 ? Arrow.loop([n - 1, x, x]) : Arrow.halt(y);
        });

        let arr = Arrow.seq([
            Arrow.fanout([
                init.lift(),
                Arrow.id(),
                Arrow.id()
            ]),
            Arrow.all([
                Arrow.id(),
                Arrow.id(),
                this
            ]).seq(rep).repeat()
        ]);

        return new NamedArrow('times(' + n + ', {0})', arr, [this]);
    }

    forever() {
        return new NamedArrow('forever({0})', this.seq(Arrow.reptop()).repeat(), [this]);
    }

    whileTrue() {
        return new NamedArrow('whileTrue({0})', this.carry().seq(Arrow.repcond()).repeat(), [this]);
    }
}

// Unary combinators
Arrow.noemit = arrow => new NoEmitCombinator(arrow);

// N-ary combinators
Arrow.seq    = arrows    => new SeqCombinator(arrows);
Arrow.any    = arrows    => new AnyCombinator(arrows);
Arrow.all    = arrows    => new AllCombinator(arrows);
Arrow.try    = (a, s, f) => new TryCombinator(a, s, f);
Arrow.fanout = arrows    => {
    arrows = getNonNull(arrows);
    var result = new SplitArrow(arrows.length).seq(Arrow.all(arrows));
    return new NamedArrow('fanout(' + arrows.map(a => a.toString()).join(', ' ) + ')', result, arrows);
}

// Convenience
Arrow.repeat = a          => a.repeat();
Arrow.bind   = (event, a) => new NamedArrow('bind(' + event + ', {0})', Arrow.seq([new SplitArrow(2), Arrow.id().all(new EventArrow(event)), a]), [a]);
Arrow.catch  = (a, f)     => Arrow.try(a, Arrow.id(), f);
Arrow.db     = (f, db)    => new QueryArrow(f, db);

// Built-ins
Arrow.id  = () => new LiftedArrow(x => {
    /* @arrow :: 'a ~> 'a */
    return x;
}).named('id');

Arrow.log = () => new LiftedArrow(x => {
    /* @arrow :: 'a ~> 'a */
    console.log(x);
    return x;
}).named('log');

Arrow.throwFalse = () => new LiftedArrow(x => {
    /* @arrow :: Bool ~> _ \ ({}, {Bool}) */
    if (x) {
        throw x;
    }
}).named('throwFalse');

// Repetition helpers
Arrow.reptop     = () => new LiftedArrow(x => {
    /* @arrow :: _ ~> <loop: _, halt: _> */
    return Arrow.loop(null)
});

Arrow.repcond    = () => new LiftedArrow((x, f) =>{
    /* @arrow :: ('a, Bool) ~> <loop: 'a, halt: _> */
    return f ? Arrow.loop(x) : Arrow.halt(null)
});

Arrow.repeatTail = () => new LiftedArrow(x => {
    /* @arrow :: <loop: 'a, halt: 'b> ~> 'a \ ({}, {'b}) */
    if (x.hasTag('loop')) {
        return x.value();
    } else {
        throw x.value();
    }
});

class TaggedValue {
    constructor(tag, val) {
        this.tag = tag;
        this.val = val;
    }

    hasTag(tag) {
        return tag == this.tag;
    }

    value() {
        return this.val;
    }
}

// Utility Constructors
Arrow.loop = x => new TaggedValue('loop', x);
Arrow.halt = x => new TaggedValue('halt', x);

var _cancelerId = 0;

class Progress {
    constructor(canEmit) {
        this.canEmit = canEmit;
        this.cancelers = {};
        this.observers = [];
    }

    addObserver(observer) {
        this.observers.push(observer);
    }

    addCanceler(canceler) {
        var id = _cancelerId++;
        this.cancelers[id] = canceler;
        return id;
    }

    advance(cancelerId) {
        if (cancelerId != null) {
            this.cancelers[cancelerId] = null;
        }

        while (this.observers.length > 0) {
            var observer = this.observers.pop();

            if (this.canEmit) {
                observer();
            }
        }
    }

    cancel() {
        for (var id in this.cancelers) {
            if (this.cancelers[id] != null) {
                this.cancelers[id]();
            }
        }

        this.cancelers = {};
    }
}
