var numarrows = 0;
var numannotations = 0;
var typecheck = true;

function construct(f) {
    if (typecheck) {
        return f();
    } else {
        return new ArrowType(new TopType(), new TopType());
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

    toString() {
        return this.constructor.name + ' :: ' + this.type.toString();
    }

    isAsync() {
        return false;
    }

    run() {
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
      var a = this;
      for (var i = 0; i < arguments.length; i++) {
        a = a.seq(arguments[i].lift().remember());
      }

      return a;
    }

    on(name, handler) {
        return this.seq(new SplitArrow(2), Arrow.id().all(new EventArrow(name)), handler);
    }

    remember() {
        return this.carry().nth(1);
    }

    carry() {
        return new SplitArrow(2).seq(Arrow.id().all(this));
    }

    // Repeating

    repeat() {
        return Arrow.fix(a => this.wait(0).seq(Arrow.try(Arrow.repeatTail(), a, Arrow.id())));
    }

    forever() {
        return this.seq(Arrow.reptop()).repeat();
    }

    whileTrue() {
        return this.carry().seq(Arrow.repcond()).repeat();
    }
}

// Unary combinators
Arrow.noemit = arrow => new NoEmitCombinator(arrow);

// N-ary combinators
Arrow.seq    = arrows    => new SeqCombinator(arrows);
Arrow.any    = arrows    => new AnyCombinator(arrows);
Arrow.all    = arrows    => new AllCombinator(arrows);
Arrow.try    = (a, s, f) => new TryCombinator(a, s, f);
Arrow.fanout = arrows    => new SplitArrow(arrows.length).seq(Arrow.all(arrows));

// Convenience
Arrow.repeat = a          => a.repeat();
Arrow.bind   = (event, a) => Arrow.seq([new SplitArrow(2), Arrow.id().all(new EventArrow(event)), a]);
Arrow.catch  = (a, f)     => Arrow.try(a, Arrow.id(), f);

// Built-ins
Arrow.id         = () => new LiftedArrow(x => /* @arrow :: 'a ~> 'a */ x);
Arrow.reptop     = () => new LiftedArrow(x => /* @arrow :: _ ~> <loop: _, halt: _> */ Arrow.loop(null));
Arrow.repcond    = () => new LiftedArrow((x, f) => /* @arrow :: ('a, Bool) ~> <loop: 'a, halt: _> */ f ? Arrow.loop(x) : Arrow.halt(null));
Arrow.repcondInv = () => new LiftedArrow((x, f) => /* @arrow :: ('a, Bool) ~> <loop: 'a, halt: _> */ !f ? Arrow.loop(x) : Arrow.halt(null));
Arrow.throwFalse = () => new LiftedArrow(x => {
  /* @arrow :: Bool ~> _ \ ({}, {Bool}) */
  if (x) {
    throw x;
  }
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
var annotationCache = {};

class LiftedArrow extends Arrow {
    constructor(f) {
        if (!(f instanceof Function)) {
            throw new Error('Cannot lift non-function');
        }

        super(construct(() => {
            numannotations++;

            var s = f.toString();
            var i = s.indexOf('/*');
            var j = s.indexOf('*/', i + 1);
            var c = s.substring(i + 2, j);

            if (annotationCache[c] !== undefined) {
                var parsed = annotationCache[c];
            } else {
                var comment;
                try {
                  comment = c.match(/\@arrow :: (.*)\n?/)[1]
                } catch (err) {
                  if (typecheck) {
                    console.warn('Function being lifted does not contain an @arrow annotation');
                  }

                  comment = '_ ~> _';
                }

                try {
                  parsed = parser.parse(comment);
                } catch (err) {
                  throw new ComposeError(`Function being lifted does not contain a parseable @arrow annotation.\n${err.message}\n`);
                }

                annotationCache[c] = parsed;
            }

            var arg = parsed[0];
            var out = parsed[1];
            var ncs = new ConstraintSet([]).addAll(parsed[2][0]);

            return new ArrowType(arg, out, ncs, parsed[2][1]).sanitize();
        }));

        this.f = f;
    }

    call(x, p, k, h) {
        try {
            // If the function has more than one parameter and we have
            // an array argument, spread the elements. Else, just call
            // the function with a single argument.

            if (x && x.constructor === Array && this.f.length > 1) {
                var result = this.f.apply(null, x);
            } else {
                var result = this.f(x);
            }

            if (typecheck) {
                this.type.out.check(result);
            }
        } catch (err) {
            return h(err);
        }

        k(result);
    }

    equals(that) {
        return that instanceof LiftedArrow && this.f === that.f;
    }
}

class ElemArrow extends LiftedArrow {
    constructor(selector) {
        super(() => {
            /* @arrow :: _ ~> Elem */
            return $(selector);
        });

        this.selector = selector;
    }

    equals(that) {
        return that instanceof ElemArrow && this.selector === that.selector;
    }
}

//
// Simple Asynchronous Arrow Implementation
//

class SimpleAsyncArrow extends Arrow {
    isAsync() {
        return true;
    }
}

class AjaxArrow extends SimpleAsyncArrow {
    constructor(f) {
        super(construct(() => {
            numannotations++;

            var s = f.toString();
            var i = s.indexOf('/*');
            var j = s.indexOf('*/', i + 1);
            var c = s.substring(i + 2, j);

            var ncs = new ConstraintSet([]);
            var err = [new NamedType('AjaxError')];

            if (annotationCache[c] !== undefined) {
                var conf = annotationCache[c][0];
                var resp = annotationCache[c][1];
            } else {
                try {
                    var conf = parser.parse(c.match(/\@conf :: (.*)\n?/)[1]);

                    ncs = ncs.addAll(conf[1][0]);
                    err = err.concat(conf[1][1]);
                } catch (err) {
                  throw new ComposeError(`Ajax config function does not contain a parseable @conf annotation.\n${err.message}\n`)
                }

                try {
                    var resp = parser.parse(c.match(/\@resp :: (.*)\n?/)[1]);

                    ncs = ncs.addAll(resp[1][0]);
                    err = err.concat(resp[1][1]);
                } catch (err) {
                  throw new ComposeError(`Ajax config function does not contain a parseable @resp annotation.\n${err.message}\n`)
                }

                annotationCache[c] = [conf, resp];
            }

            return new ArrowType(conf[0], resp[0], ncs, err).sanitize();
        }));

        this.c = f;
    }

    call(x, p, k, h) {
        // If the function has more than one parameter and we have
        // an array argument, spread the elements. Else, just call
        // the function with a single argument.

        // TODO - wrap this in try

        if (x && x.constructor === Array && this.c.length > 1) {
            var conf = this.c.apply(null, x);
        } else {
            var conf = this.c(x);
        }

        let abort = false;

        const cancel = () => {
            abort = true;
        }

        const fail = h;
        const succ = x => {
            if (typecheck) {
                this.type.out.check(x);
            }

            k(x);
        };

        $.ajax($.extend(conf, {
            success: (x, status, xhr) => { if (!abort) { p.advance(cancelerId); succ(x); } },
            error  : (xhr, status, x) => { if (!abort) { p.advance(cancelerId); fail(x); } },
        }));

        var cancelerId = p.addCanceler(cancel);
    }

    equals(that) {
        // TODO - deep comparison of objects
        return that instanceof AjaxArrow && this.config === that.config;
    }
}

class EventArrow extends SimpleAsyncArrow {
    constructor(name) {
        // Elem ~> Event
        super(construct(() => new ArrowType(new NamedType('Elem'), new NamedType('Event'))));
        this.name = name;
    }

    call(x, p, k, h) {
        let abort = false;

        const cancel = () => {
            abort = true;
            x.off(this.name, runner);
        };

        const runner = ev => {
            if (!abort) {
                cancel();
                p.advance(cancelerId);
                k(ev);
            }
        };

        x.on(this.name, runner);
        var cancelerId = p.addCanceler(cancel);
    }

    equals(that) {
        return that instanceof EventArrow && this.name === that.name;
    }
}

class DynamicDelayArrow extends SimpleAsyncArrow {
    constructor() {
        // Number ~> _
        super(construct(() => {
            return new ArrowType(new NamedType('Number'), new TopType());
        }));
    }

    call(x, p, k, h) {
        const cancel = () => clearTimeout(timer);
        const runner = () => {
            p.advance(cancelerId);
            k();
        };

        var timer = setTimeout(runner, x);
        var cancelerId = p.addCanceler(cancel);
    }

    equals(that) {
        return that instanceof DynamicDelayArrow;
    }
}

class DelayArrow extends SimpleAsyncArrow {
    constructor(duration) {
        // 'a ~> 'a
        super(construct(() => {
            var alpha = ParamType.fresh();
            return new ArrowType(alpha, alpha);
        }));

        this.duration = duration;
    }

    call(x, p, k, h) {
        const cancel = () => clearTimeout(timer);
        const runner = () => {
            p.advance(cancelerId);
            k(x);
        };

        var timer = setTimeout(runner, this.duration);
        var cancelerId = p.addCanceler(cancel);
    }

    equals(that) {
        return that instanceof Delay && this.duration === that.duration;
    }
}

//
// Simple (Generalized) Arrows
//

class SplitArrow extends Arrow {
    constructor(n) {
        super(construct(() => {
            var arg = ParamType.fresh();
            var out = Array.create(n, arg);

            return new ArrowType(arg, new TupleType(out));
        }));

        this.n = n;
    }

    call(x, p, k, h) {
        // TODO - clone values
        k(Array.create(this.n, x));
    }

    equals(that) {
        return that instanceof SplitArrow && this.n === that.n;
    }
}

class NthArrow extends Arrow {
    constructor(n) {
        super(construct(() => {
            var arg = Array.create(n).map(() => ParamType.fresh());
            var out = arg[n - 1];

            return new ArrowType(new TupleType(arg), out);
        }));

        this.n = n;
    }

    call(x, p, k, h) {
        k(x[this.n - 1]);
    }

    equals(that) {
        return that instanceof NthArrow && this.n === that.n;
    }
}
class ComposeError extends Error {
    constructor(message) {
        super();
        this.message = message;
    }

    toString() {
        return this.message;
    }
}

class Combinator extends Arrow {
    constructor(type, arrows) {
        super(type);
        this.arrows = arrows;
    }

    isAsync() {
        return this.arrows.some(a => a.isAsync());
    }

    equals(that) {
        if (this.constructor === that.constructor) {
            return this.arrows.length === that.arrows.length && this.arrows.every((a, i) => a.equals(that.arrows[i]));
        }

        return false;
    }
}

class NoEmitCombinator extends Combinator {
    constructor(f) {
        super(construct(() => {
            return f.type;
        }), [f]);
    }

    call(x, p, k, h) {
        var quiet = new Progress(false);
        p.addCanceler(() => quiet.cancel());

        this.arrows[0].call(x, quiet, z => {
            p.advance();

            setTimeout(() => {
                k(z);
            }, 0);
        }, h);
    }

    isAsync() {
        return true;
    }
}

class SeqCombinator extends Combinator {
    constructor(arrows) {
        super(construct(() => {
            var sty = sanitizeTypes(arrows);

            try {
                var len = sty.length - 1;

                var arg = sty[0].arg;
                var out = sty[len].out;
                var ncs = new ConstraintSet([]);
                var err = sty[0].errors;

                sty.forEach((t, i) => {
                    ncs = ncs.concat(t.constraints);
                    err = err.concat(t.errors);

                    if (i != 0) {
                        ncs = ncs.add(new Constraint(sty[i - 1].out, t.arg));
                    }
                });

               return new ArrowType(arg, out, ncs, err);
            } catch (err) {
              var message;
              let location = getLocation(err.stack);

              if (location) {
                message = 'Unable to seq arrows at: ' + location;
              } else {
                message = 'Unable to seq arrows'
              }

              throw new ComposeError(message + '\n\tInput => Seq(' + sty.join(', ') + ')\n\tError => ' + err);
            }
       }), arrows);
    }

    call(x, p, k, h) {
        const rec = (y, [head, ...tail]) => {
            if (head === undefined) {
                k(y);
            } else {
                head.call(y, p, z => rec(z, tail), h);
            }
        };

        rec(x, this.arrows);
    }
}

class AllCombinator extends Combinator {
    constructor(arrows) {
        super(construct(() => {
            var sty = sanitizeTypes(arrows);

            try {
                var arg = [];
                var out = [];
                var ncs = new ConstraintSet([]);
                var err = [];

                sty.forEach((t, i) => {
                    arg.push(t.arg);
                    out.push(t.out);

                    ncs = ncs.concat(t.constraints);
                    err = err.concat(t.errors);
                });

                return new ArrowType(new TupleType(arg), new TupleType(out), ncs, err);
            } catch (err) {
              var message;
              let location = getLocation(err.stack);

              if (location) {
                message = 'Unable to all arrows at: ' + location;
              } else {
                message = 'Unable to all arrows'
              }

              throw new ComposeError(message + '\n\tInput => All(' + sty.join(', ') + ')\n\tError => ' + err);
            }
       }), arrows);
    }

    call(x, p, k, h) {
        var numFinished = 0;
        var callResults = this.arrows.map(x => null);

        this.arrows.forEach((a, i) => {
            a.call(x[i], p, y => {
                callResults[i] = y;

                // Once results array is finished, continue
                if (++numFinished == this.arrows.length) {
                    k(callResults);
                }
            }, h);
        });
    }
}

class AnyCombinator extends Combinator {
    constructor(arrows) {
        super(construct(() => {
            var sty = sanitizeTypes(arrows);

            try {
                var arg = ParamType.fresh();
                var out = ParamType.fresh();
                var ncs = new ConstraintSet([]);
                var err = [];

                sty.forEach((t, i) => {
                    ncs = ncs.concat(t.constraints);
                    err = err.concat(t.errors);

                    ncs = ncs.add(new Constraint(arg, t.arg));
                    ncs = ncs.add(new Constraint(t.out, out));
                });

                return new ArrowType(arg, out, ncs, err);
            } catch (err) {
              var message;
              let location = getLocation(err.stack);

              if (location) {
                message = 'Unable to any arrows at: ' + location;
              } else {
                message = 'Unable to any arrows'
              }

              throw new ComposeError(message + '\n\tInput => Any(' + sty.join(', ') + ')\n\tError => ' + err);
            }
       }), arrows);
    }

    call(x, p, k, h) {
        // Note: This must be done at execution time instead of construction
        // time because a recursive arrow may present itself as falsely async.

        if (!this.arrows.every(a => a.isAsync())) {
            throw new Error('Any combinator requires asynchronous arrow arguments');
        }

        let progress = this.arrows.map(() => new Progress(true));

        // If combinator is canceled, cancel all children
        p.addCanceler(() => progress.forEach(p => p.cancel()));

        this.arrows.forEach((a, i) => {
            // When arrow[i] progresses, cancel others
            progress[i].addObserver(() => {
                p.advance();

                progress.forEach((p, j) => {
                    if (j != i) {
                        p.cancel();
                    }
                });
            });

            // TODO - clone value
            // Kick off execution synchronously
            a.call(x, progress[i], k, h);
        });
    }

    isAsync() {
        return true;
    }
}

class TryCombinator extends Combinator {
    constructor(a, s, f) {
        super(construct(() => {
            var sta = sanitizeTypes([a])[0];
            var sts = sanitizeTypes([s])[0];
            var stf = sanitizeTypes([f])[0];

            try {
                var arg = sta.arg;
                var out = ParamType.fresh();
                var ncs = new ConstraintSet([]);
                var err = [];

                ncs = ncs.concat(sta.constraints);
                ncs = ncs.concat(sts.constraints);
                ncs = ncs.concat(stf.constraints);
                ncs = ncs.add(new Constraint(sta.out, sts.arg));
                ncs = ncs.add(new Constraint(sts.out, out));
                ncs = ncs.add(new Constraint(stf.out, out));

                sta.errors.forEach((e, i) => {
                    ncs = ncs.add(new Constraint(e, stf.arg));
                });

                err = err.concat(sts.errors);
                err = err.concat(stf.errors);

                return new ArrowType(arg, out, ncs, err);
            } catch (err) {
              var message;
              let location = getLocation(err.stack);

              if (location) {
                message = 'Unable to try arrows at: ' + location;
              } else {
                message = 'Unable to try arrows'
              }

              throw new ComposeError(message + '\n\tInput => Try(' + [sta, sts, stf].join(', ') + ')\n\tError => ' + err);
            }
        }), [a, s, f]);
    }

    call(x, p, k, h) {
        // Invoke original error callback 'h' if either
        // callback creates an error value. This allows
        // nesting of error callbacks.

        var branch = new Progress(true);
        p.addCanceler(() => branch.cancel());
        branch.addObserver(() => p.advance());

        this.arrows[0].call(x, branch,
            y => this.arrows[1].call(y, p, k, h),
            z => {
                branch.cancel();
                this.arrows[2].call(z, p, k, h);
            }
        );
    }

    isAsync() {
      return (this.arrows[0].isAsync() || this.arrows[1].isAsync()) && this.arrows[2].isAsync();
    }
}

//
// Fix-Point Combinator
//

Arrow.fix = function(ctor) {
    var arg = ParamType.fresh(true);
    var out = ParamType.fresh(true);

    var p = new ProxyArrow(arg, out);
    var a = ctor(p);
    p.freeze(a);

    if (!(a instanceof Arrow)) {
      throw new Error('Fix constructor must return an arrow')
    }

    var t = a.type.toString();

    var map = {};
    descendants(arg).forEach(d => map[d.id] = arg);
    descendants(out).forEach(d => map[d.id] = out);

    arg.noreduce = false;
    out.noreduce = false;
    a.type.substitute(map);

    a.type.constraints = a.type.constraints.add(new Constraint(a.type.arg, arg));
    a.type.constraints = a.type.constraints.add(new Constraint(arg, a.type.arg));
    a.type.constraints = a.type.constraints.add(new Constraint(a.type.out, out));
    a.type.constraints = a.type.constraints.add(new Constraint(out, a.type.out));

    try {
        a.type.resolve();
    } catch (err) {
        var message;
        let location = getLocation(err.stack);

        if (location) {
          message = 'Unable to fix arrow at: ' + location;
        } else {
          message = 'Unable to fix arrow'
        }

        throw new ComposeError(message + '\n\tInput => Fix(' + t + ')\n\tError => ' + err);
    }

    return a;
}

class ProxyArrow extends Arrow {
    constructor(arg, out) {
        super(construct(() => {
            return new ArrowType(arg, out);
        }));

        this.arrow = null;
    }

    freeze(arrow) {
        this.arrow = arrow;
    }

    call(x, p, k, h) {
        return this.ensureFrozen(a => a.call(x, p, k, h));
    }

    equals(that) {
        return this.ensureFrozen(a => a.equals(that));
    }

    isAsync() {
        return this.ensureFrozen(a => a.isAsync());
    }

    ensureFrozen(f) {
        if (this.arrow != null) {
            return f(this.arrow);
        }

        throw new Error('Proxy not frozen')
    }
}

function descendants(param) {
    var children = [param];
    for (let child of param.children) {
        for (let descendant of descendants(child)) {
            children.push(descendant);
        }
    }

    return children;
}
class Type {
    equals(that) {
        throw new Error('Equals undefined')
    }

    check(value) {
        throw new TypeClash(this, value);
    }

    isParam() {
        return false;
    }

    isConcrete() {
        return true;
    }

    harvest() {
        return [];
    }

    substitute(map) {
        return this;
    }

    sanitize(map) {
        return this;
    }
}

var uniqid = 0;

class ParamType extends Type {
    static fresh(noreduce) {
        return new ParamType(++uniqid, noreduce || false);
    }

    constructor(id, noreduce) {
        super();
        this.id = id;
        this.noreduce = noreduce;
        this.children = [];
    }

    equals(that) {
        return that instanceof ParamType && this.id === that.id;
    }

    toString() {
        return "'" + this.id;
    }

    check(value) {
    }

    isParam() {
        return true;
    }

    isConcrete() {
        return false;
    }

    harvest() {
        return [this];
    }

    substitute(map) {
        return this.id in map ? map[this.id] : this;
    }

    sanitize(map) {
        if (!(this.id in map)) {
            var p = ParamType.fresh(this.noreduce);
            this.children.push(p);
            map[this.id] = p;
        }

        return map[this.id];
    }
}

class TopType extends Type {
    equals(that) {
        return that instanceof TopType;
    }

    toString() {
        return '_';
    }

    check(value) {
    }
}

var runtimeCheckers = {
    'Bool'  : v => v === true || v === false,
    'Number': v => typeof v == "number",
    'String': v => typeof v == "string",
    'Elem'  : v => v instanceof jQuery,
    'Event' : v => false, // TODO
};

function checkNamedType(name, value) {
    var checker = runtimeCheckers[name];

    if (checker) {
        return checker(value);
    } else {
        throw new Error(`Named type '${name}' does not have an associated checker.`);
    }
}

class NamedType extends Type {
    constructor(name) {
        super();
        this.name = name;
    }

    equals(that) {
        return that instanceof NamedType && this.name === that.name;
    }

    toString() {
        return this.name;
    }

    check(value) {
        if (!checkNamedType(this.name, value)) {
            super.check(value);
        }
    }
}

class SumType extends Type {
    constructor(names) {
        super();
        this.names = names.unique().sort();
    }

    equals(that) {
        if (that instanceof SumType) {
            return this.names.length === that.names.length && this.names.every((n, i) => n === that.names[i]);
        }

        return false;
    }

    toString() {
        return this.names.join('+');
    }

    check(value) {
        if (!this.names.some(name => checkNamedType(name, value))) {
            super.check(value);
        }
    }
}

class TaggedUnionType extends Type {
    constructor(map) {
        super();
        this.vals = map;
        this.keys = Object.keys(map).sort();
    }

    equals(that) {
        if (that instanceof TaggedUnionType) {
            return this.keys.length === that.keys.length && this.keys.every(k => this.vals[k].equals(that.vals[k]));
        }

        return false;
    }

    toString() {
        return '<' + this.keys.map(k => k + ': ' + this.vals[k].toString()).join(', ') + '>';
    }

    check(value) {
        try {
            for (var key in this.keys) {
                if (value.hasTag(key)) {
                    return this.vals[key].check(value.value());
                }
            }

            return false;
        } catch (err) {
            super.check(value);
        }
    }

    isConcrete() {
        return this.keys.every(k => this.vals[k].isConcrete());
    }

    harvest() {
        return this.keys.reduce((acc, k) => acc.concat(this.vals[k].harvest()), []);
    }

    substitute(map) {
        var map = {};
        this.keys.forEach(k => {
            map[k] = this.vals[k].substitute(map);
        });

        return new TaggedUnionType(map);
    }

    sanitize(map) {
        var vals = {};
        this.keys.forEach(k => {
            vals[k] = this.vals[k].sanitize(map);
        });

        return new TaggedUnionType(vals);
    }
}

class ArrayType extends Type {
    constructor(type) {
        super();
        this.type = type;
    }

    equals(that) {
        if (that instanceof ArrayType) {
            return this.type.equals(that.type);
        }

        return false;
    }

    toString() {
         return '[' + this.type.toString() + ']';
    }

    check(value) {
        if (value && value.constructor === Array) {
            value.forEach(v => this.type.check(v));
        } else {
            super.check(value);
        }
    }

    isConcrete() {
        return this.type.isConcrete();
    }

    harvest() {
        return this.type.harvest();
    }

    substitute(map) {
        return new ArrayType(this.type.substitute(map));
    }

    sanitize(map) {
        return new ArrayType(this.type.sanitize(map));
    }
}

class TupleType extends Type {
    constructor(types) {
        super();
        this.types = types;
    }

    equals(that) {
        if (that instanceof TupleType) {
            return this.types.length === that.types.length && this.types.every((t, i) => t.equals(that.types[i]));
        }

        return false;
    }

    toString() {
        return '(' + this.types.map(t => t.toString()).join(', ') + ')';
    }

    check(value) {
        if (value && value.constructor === Array) {
            value.forEach((v, i) => this.types[i].check(v));
        } else {
            super.check(value);
        }
    }

    isConcrete() {
        return this.types.every(t => t.isConcrete());
    }

    harvest() {
        return this.types.reduce((acc, t) => acc.concat(t.harvest()), []);
    }

    substitute(map) {
        return new TupleType(this.types.map(t => t.substitute(map)));
    }

    sanitize(map) {
        return new TupleType(this.types.map(t => t.sanitize(map)));
    }
}

class RecordType extends Type {
    constructor(map) {
        super();
        this.vals = map;
        this.keys = Object.keys(map).sort();
    }

    equals(that) {
        if (that instanceof RecordType) {
            return this.keys.length === that.keys.length && this.keys.every(k => this.vals[k].equals(that.vals[k]));
        }

        return false;
    }

    toString() {
        return '{' + this.keys.map(k => k + ': ' + this.vals[k].toString()).join(', ') + '}';
    }

    check(value) {
        try {
            this.keys.forEach(k => {
                this.vals[k].check(value[k]);
            });
        } catch (err) {
            super.check(value);
        }
    }

    isConcrete() {
        return this.keys.every(k => this.vals[k].isConcrete());
    }

    harvest() {
        return this.keys.reduce((acc, k) => acc.concat(this.vals[k].harvest()), []);
    }

    substitute(map) {
        var vals = {};
        this.keys.forEach(k => {
            vals[k] = this.vals[k].substitute(map);
        });

        return new RecordType(vals);
    }

    sanitize(map) {
        var vals = {};
        this.keys.forEach(k => {
            vals[k] = this.vals[k].sanitize(map);
        });

        return new RecordType(vals);
    }
}
class TypeClash extends Error {
    constructor(type, value) {
        super();

        this.type = type;
        this.value = value;
    }

    toString() {
        return `Runtime type assertion failure: Expected ${this.type.toString()}', got '${JSON.stringify(this.value)}'.`;
    }
}

class Constraint {
    constructor(lower, upper) {
        this.lower = lower;
        this.upper = upper;
    }

    equals(that) {
        if (that instanceof Constraint) {
            return this.lower.equals(that.lower) && this.upper.equals(that.upper);
        }

        return false;
    }

    toString() {
        return this.lower.toString() + ' <= ' + this.upper.toString();
    }

    isUseless() {
        return this.lower.equals(this.upper) || this.upper instanceof TopType;
    }

    isConsistent() {
        var a = this.lower;
        var b = this.upper;

        if (a instanceof NamedType || a instanceof SumType) {
            if (b instanceof NamedType || b instanceof SumType) {
                var na = (a instanceof NamedType) ? [a] : a.names;
                var nb = (b instanceof NamedType) ? [b] : b.names;

                return na.every(t1 => nb.some(t2 => t1.equals(t2)));
            }
        }

        if (a instanceof ArrayType       && b instanceof ArrayType)       return true;
        if (a instanceof TupleType       && b instanceof TupleType)       return b.types.length <= a.types.length;
        if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) return a.keys.every(k => b.keys.indexOf(k) >= 0);
        if (a instanceof RecordType      && b instanceof RecordType)      return b.keys.every(k => a.keys.indexOf(k) >= 0);

        return (b instanceof TopType) || a.isParam() || b.isParam();
    }

    unary() {
        if (this.lower instanceof ArrayType && this.upper instanceof ArrayType) {
            return [new Constraint(this.lower.type, this.upper.type)];
        }

        if (this.lower instanceof TupleType && this.upper instanceof TupleType) {
            return this.upper.types.map((t, i) => new Constraint(this.lower.types[i], t));
        }

        if (this.lower instanceof TaggedUnionType && this.upper instanceof TaggedUnionType) {
            return this.lower.keys.map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
        }

        if (this.lower instanceof RecordType && this.upper instanceof RecordType) {
            return this.upper.keys.map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
        }

        return [];
    }

    binary(that) {
        if (this.upper.equals(that.lower)) {
            return [new Constraint(this.lower, that.upper)];
        }

        if (this.lower.equals(that.upper)) {
            return [new Constraint(that.lower, this.upper)];
        }

        return [];
    }
}

class ConstraintSet {
    constructor(constraints) {
        this.constraints = constraints.filter(c => !c.isUseless());
        var inconsistent = constraints.filter(c => !c.isConsistent());

        if (inconsistent.length != 0) {
            throw new Error('Inconsistent constraints: [' + inconsistent.map(c => c.toString()).join(', ') + ']');
        }
    }

    equals(that) {
      if (this.constraints.length == that.constraints.length) {
        for (var i = 0; i < this.constraints.length; i++) {
          if (!this.contains(this.constraints[i])) {
            return false;
          }
        }

        return true;
      }

      return false;
    }

    contains(constraint) {
      for (var i = 0; i < this.constraints.length; i++) {
        if (this.constraints[i].equals(constraint)) {
          return true;
        }
      }

      return false;
    }

    toString() {
        return '{' + this.constraints.map(c => c.toString()).join(', ') + '}';
    }

    add(constraint) {
        if (this.constraints.some(c => c.equals(constraint))) {
            return this;
        }

        return new ConstraintSet(this.constraints.concat([constraint]));
    }

    addAll(constraints) {
        return constraints.reduce((set, c) => set.add(c), this);
    }

    concat(cs) {
        return this.addAll(cs.constraints);
    }

    substitute(map) {
        return new ConstraintSet(this.constraints.map(c => new Constraint(c.lower.substitute(map), c.upper.substitute(map))));
    }

    sanitize(map) {
        return new ConstraintSet(this.constraints.map(c => new Constraint(c.lower.sanitize(map), c.upper.sanitize(map))));
    }
}

//
// Arrow Type
//

class ArrowType {
    constructor(arg, out, constraints, errors) {
        this.arg = arg;
        this.out = out;
        this.constraints = constraints || new ConstraintSet([]);
        this.errors = [];

        for (let type of (errors || [])) {
            if (!this.errors.some(e => e.equals(type))) {
                this.errors.push(type);
            }
        }

        this.resolve();
    }

    toString() {
        var type = this.arg.toString() + ' ~> ' + this.out.toString();

        if (this.constraints.constraints.length > 0 || this.errors.length > 0) {
            type += ' \\ (';
            type += this.constraints.toString();
            type += ', {';
            type += this.errors.map(t => t.toString()).join(', ');
            type += '})';
        }

        return type;
    }

    resolve() {
        var initial = this.constraints;

        while (true) {
            this.constraints = this.closure();
            this.constraints = this.mergeConcreteBounds();

            var map = this.collectBounds();

            if (Object.getOwnPropertyNames(map).length === 0) {
                break;
            }

            this.substitute(map);
        }

        var cs = this.prune();

        if (cs.constraints.length === this.constraints.constraints.length || initial.equals(cs)) {
          return;
        }

        this.constraints = cs;
        this.resolve();
    }

    substitute(map) {
        this.arg = this.arg.substitute(map);
        this.out = this.out.substitute(map);
        this.constraints = this.constraints.substitute(map);
        this.errors = this.errors.map(e => e.substitute(map));
    }

    /**
     * Add the result of unary and binary closure rules on each constraint in
     * the set until no new constraints are produced (a fixed point reached).
     */
    closure() {
        var cs = [];
        var wl = Array.copy(this.constraints.constraints);

        while (wl.length > 0) {
            var w = wl.pop();

            if (!cs.some(c => c.equals(w))) {
                w.unary().forEach(c => wl.push(c));

                for (let c of cs) {
                    w.binary(c).forEach(c => wl.push(c));
                }

                cs.push(w);
            }
        }

        return new ConstraintSet(cs);
    }

    /**
     * Replace multiple constraints which upper bound or lower bound a param
     * type with the lub or glb, respectively, of the concrete bound.
     */
    mergeConcreteBounds() {
        var idmap = {};
        var lower = {};
        var upper = {};
        var other = [];

        for (let c of this.constraints.constraints) {
            var a = c.lower;
            var b = c.upper;

            if (a.isParam()) idmap[a.id] = a;
            if (b.isParam()) idmap[b.id] = b;

                 if (a.isParam() && b.isConcrete()) lower[a.id] = (a.id in lower) ? glb(lower[a.id], b) : b;
            else if (b.isParam() && a.isConcrete()) upper[b.id] = (b.id in upper) ? lub(upper[b.id], a) : a;
            else                                    other.push(c);
        }

        if (lower.length === 0 && upper.length === 0) {
            return null;
        }

        Object.keys(lower).forEach(id => other.push(new Constraint(idmap[id], lower[id])));
        Object.keys(upper).forEach(id => other.push(new Constraint(upper[id], idmap[id])));

        return new ConstraintSet(other);
    }

    /**
     * Create a substitution map. A param type p can be replaced by type t iff
     * one of the following hold:
     *
     *    - t <= p and p <= t
     *    - p^- <= t (and t is sole upper bound of p)
     *    - t <= p^+ (and t is sole lower bound of p)
     */
    collectBounds() {
        var map = {};

        function addToMap(p, t) {
            map[p.id] = (t.isParam() && t.id in map) ? map[t.id] : t;
        }

        var cs = this.constraints.constraints;
        var lowerParam = cs.filter(c => c.lower.isParam() && !c.lower.noreduce);
        var upperParam = cs.filter(c => c.upper.isParam() && !c.upper.noreduce);

        lowerParam.forEach(c1 => {
            upperParam.forEach(c2 => {
                if (c1.lower.equals(c2.upper) && c1.upper.equals(c2.lower)) {
                    addToMap(c1.lower, c1.upper);
                }
            });
        });

        var [n, p] = this.polarity();
        var negVar = n.filter(v => !p.some(x => x.equals(v))); // negative-only params
        var posVar = p.filter(v => !n.some(x => x.equals(v))); // positive-only params

        // Replace negative variables by their sole upper bound, if it exists
        negVar.map(p => cs.filter(c => c.lower === p)).filter(cs => cs.length === 1).forEach(c => {
            addToMap(c[0].lower, c[0].upper);
        });

        // Replace positive variables by their sole lower bound, if it exists
        posVar.map(p => cs.filter(c => c.upper === p)).filter(cs => cs.length === 1).forEach(c => {
            addToMap(c[0].upper, c[0].lower);
        });

        return map;
    }

    /**
     * Remove all constraints which are in one of the following forms:
     *
     *    - t <= t where neither are params
     *    - a <= b and (a or b) is not in the arrow type
     *    - t <= p^-
     *    - p^+ <= t
     */
    prune() {
        let [n, p] = this.polarity();
        var params = this.arg.harvest().concat(this.out.harvest()).concat(this.errors);

        return new ConstraintSet(this.constraints.constraints.filter(c => {
            // Keep no-reduce parameters
            if (c.lower.isParam() && c.lower.noreduce) return true;
            if (c.upper.isParam() && c.upper.noreduce) return true;

            // Remove non-parameter constraints
            if (!c.lower.isParam() && !c.upper.isParam()) return false;

            // Remove unknown type variables
            if (c.lower.isParam() && c.upper.isParam() && !params.some(p => p.equals(c.lower))) return false;
            if (c.lower.isParam() && c.upper.isParam() && !params.some(p => p.equals(c.upper))) return false;

            // Remove constraints with useless polarity
            if (c.lower.isParam() && !n.some(p => p.equals(c.lower))) return false;
            if (c.upper.isParam() && !p.some(p => p.equals(c.upper))) return false;

            return true;
        }));
    }

    /**
     * Determine which variables in arg and out have negative or positive position. This algorithm uses
     * dumb iteration and may be improved by the use of a worklist. The return value fo this function is
     * a pair [n, p] where n is the set of negative variables and p is the set of positive variables. If
     * a variable is both negative and positive it exists in both sets. If a variable is unreachable by
     * arg or out then it will be absent from both lists.
     */
    polarity() {
        var neg = this.arg.harvest();
        var pos = this.out.harvest().concat(this.errors);

        var changed = true;
        var negDefs = this.constraints.constraints.filter(c => c.lower.isParam()).map(c => [c.lower, c.upper.harvest()]);
        var posDefs = this.constraints.constraints.filter(c => c.upper.isParam()).map(c => [c.upper, c.lower.harvest()]);

        while (changed) {
            changed = false;

            var extraNeg = negDefs.filter(([a, b]) => neg.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !neg.some(p => p === x));
            var extraPos = posDefs.filter(([a, b]) => pos.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !pos.some(p => p === x));

            if (extraNeg.length > 0 || extraPos.length > 0) {
                changed = true;
                neg = neg.concat(extraNeg);
                pos = pos.concat(extraPos);
            }
        }

        return [neg, pos];
    }

    sanitize() {
        var map = {};
        var arg = this.arg.sanitize(map);
        var out = this.out.sanitize(map);
        var constraints = this.constraints.sanitize(map);
        var errors = this.errors.map(e => e.sanitize(map));

        return new ArrowType(arg, out, constraints, errors);
    }
}

//
// Type Utilities
//

function sanitizeTypes(arrows) {
    return arrows.map(a => a.type).map(t => t.sanitize());
}

function lub(a, b) {
    if (a.equals(b)) {
        return a;
    }

    if (a instanceof NamedType || a instanceof SumType) {
        if (b instanceof NamedType || b instanceof SumType) {
            var na = (a instanceof NamedType) ? [a] : a.names;
            var nb = (b instanceof NamedType) ? [b] : b.names;
            var nu = na.concat(nb.filter(n => na.indexOf(n) < 0));

            if (nu.length == 1) return new NamedType(nu[0]);
            if (nu.length >= 2) return new SumType(nu);
        }
    }

    if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) {
        var map = {};
        b.labels().filter(k => a.labels().indexOf(k) >= 0).forEach(k => {
            map[k] = lub(a.typeMap[k], b.typeMap[k]);
        });

        return new TaggedUnionType(map);
    }

    if (a instanceof ArrayType && b instanceof ArrayType) {
        return new ArrayType(lub(a.type, b.type));
    }

    if (a instanceof TupleType && b instanceof TupleType) {
        return new TupleType(a.types.length < b.types.length
            ? a.types.map((t, i) => lub(t, b.types[i]))
            : b.types.map((t, i) => lub(t, a.types[i])));
    }

    if (a instanceof RecordType && b instanceof RecordType) {
        var map = {};
        a.keys.filter(k => b.keys.indexOf(k) >= 0).forEach(k => {
            map[k] = lub(a.vals[k], b.vals[k]);
        });

        return new RecordType(map);
    }

    return new TopType();
}

function glb(a, b) {
    if (a.equals(b)) {
        return a;
    }

    if (a instanceof TopType) return b;
    if (b instanceof TopType) return a;

    if (a instanceof NamedType || a instanceof SumType) {
        if (b instanceof NamedType || b instanceof SumType) {
            var na = (a instanceof NamedType) ? [a] : a.names;
            var nb = (b instanceof NamedType) ? [b] : b.names;
            var ni = na.filter(t1 => nb.some(t2 => t1 === t2));

            if (ni.length == 1) return new NamedType(ni[0]);
            if (ni.length >= 2) return new SumType(ni);
        }
    }

    if (a instanceof ArrayType && b instanceof ArrayType) {
        return new ArrayType(glb(a.type, b.type));
    }

    if (a instanceof TupleType && b instanceof TupleType) {
        return new TupleType(a.types.length < b.types.length
            ? b.types.map((t, i) => i >= a.types.length ? t : glb(t, a.types[i]))
            : a.types.map((t, i) => i >= b.types.length ? t : glb(t, b.types[i])));
    }

    if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) {
        var map = {};
        a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
        b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

        return new RecordType(map);
    }

    if (a instanceof RecordType && b instanceof RecordType) {
        var map = {};
        a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
        b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

        return new RecordType(map);
    }

    throw new Error(`No greatest lower bound of '${a.toString()}' and '${b.toString()}'.`);
}
function getLocation(stack) {
  let r = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g);

  for (let match of stack.match(r)) {
    let parts = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g).exec(match);

    if (!parts[1].endsWith('arrows.js')) {
      return parts[1] + ':' + parts[2];
    }
  }

  return '';
}
