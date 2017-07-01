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

    toString() {
        return this.constructor.name + '(' + this.arrows.map(a => a.toString()).join(', ') + ') :: ' + this.type.toString();
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

class NamedArrow extends Combinator {
    constructor(name, a, args) {
        super(_construct(() => {
            return a.type;
        }), [a]);

        this.name = format(name, (args || []).map(a => a.toString()));
    }

    toString() {
        return this.name + ' :: ' + this.arrows[0].type.toString();
    }

    call(x, p, k, h) {
        this.arrows[0].call(x, p, k, h);
    }

    isAsync() {
        return this.arrows[0].isAsync();
    }
}

class NoEmitCombinator extends Combinator {
    constructor(a) {
        super(_construct(() => {
            return a.type;
        }), [a]);
    }

    toString() {
        return 'noemit(' + this.arrows[0].toString() + ') :: ' + this.type.toString();
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
        arrows = getNonNull(arrows);

        super(_construct(() => {
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

    toString() {
        return 'seq(' + this.arrows.map(a => a.toString()).join(', ') + ') :: ' + this.type.toString();
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
        arrows = getNonNull(arrows);

        super(_construct(() => {
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

    toString() {
        return 'all(' + this.arrows.map(a => a.toString()).join(', ') + ') :: ' + this.type.toString();
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
        arrows = getNonNull(arrows);

        super(_construct(() => {
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

    toString() {
        return 'any(' + this.arrows.map(a => a.toString()).join(', ') + ') :: ' + this.type.toString();
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
        super(_construct(() => {
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

    toString() {
        return 'try(' + this.arrows.map(a => a.toString()).join(', ') + ') :: ' + this.type.toString();
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
        super(_construct(() => {
            return new ArrowType(arg, out);
        }));

        this.arrow = null;
    }

    toString() {
        if (this.arrow != null) {
            return 'omega :: ' + this.arrow.type.toString();
        }

        return 'omega :: ???';
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

function getNonNull(arrows) {
    var filtered = arrows.filter(a => a != null);
    if (filtered.length > 0) {
        return filtered;
    }

    throw new ComposeError('Combinator contains no non-null arguments.');
}

function format(format, args) {
    return format.replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] != 'undefined' ? args[number] : match;
    });
}
