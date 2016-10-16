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
