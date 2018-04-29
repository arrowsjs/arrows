class TypeClash extends Error {
    constructor(type, value) {
        super();

        this.type = type;
        this.value = value;
    }

    toString() {
        return `Runtime type assertion failure: Expected ${this.type.toString()}", got "${JSON.stringify(this.value)}".`;
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
        return this.lower.toString() + " <= " + this.upper.toString();
    }

    isUseless() {
        return this.lower.equals(this.upper) || this.upper instanceof TopType;
    }

    isConsistent() {
        let a = this.lower;
        let b = this.upper;

        if (hasNames(a) && hasNames(b)) {
            return a.names.every(t1 => b.names.some(t2 => t1 == t2));
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
            return this.upper.types.filter((t, i) => i < this.lower.types.length).map((t, i) => new Constraint(this.lower.types[i], t));
        }

        if (this.lower instanceof TaggedUnionType && this.upper instanceof TaggedUnionType) {
            return this.lower.keys.filter(k => this.upper.keys.indexOf(k) >= 0).map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
        }

        if (this.lower instanceof RecordType && this.upper instanceof RecordType) {
            return this.upper.keys.filter(k => this.lower.keys.indexOf(k) >= 0).map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
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
        let inconsistent = constraints.filter(c => !c.isConsistent());

        if (inconsistent.length != 0) {
            throw new Error("Inconsistent constraints: [" + inconsistent.map(c => c.toString()).join(", ") + "]");
        }
    }

    equals(that) {
        if (this.constraints.length == that.constraints.length) {
            for (let i = 0; i < this.constraints.length; i++) {
                if (!this.contains(this.constraints[i])) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }

    contains(constraint) {
        for (let i = 0; i < this.constraints.length; i++) {
            if (this.constraints[i].equals(constraint)) {
                return true;
            }
        }

        return false;
    }

    toString() {
        return "{" + this.constraints.map(c => c.toString()).join(", ") + "}";
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
        let type = this.arg.toString() + " ~> " + this.out.toString();

        if (this.constraints.constraints.length > 0 || this.errors.length > 0) {
            type += " \\ (";
            type += this.constraints.toString();
            type += ", {";
            type += this.errors.map(t => t.toString()).join(", ");
            type += "})";
        }

        return type;
    }

    resolve() {
        let initial = this.constraints;

        while (true) {
            this.constraints = this.closure();
            this.constraints = this.mergeConcreteBounds();

            let map = this.collectBounds();

            if (Object.getOwnPropertyNames(map).length === 0) {
                break;
            }

            this.substitute(map);
        }

        let cs = this.prune();

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
        let cs = [];
        let wl = Array.copy(this.constraints.constraints);

        while (wl.length > 0) {
            let w = wl.pop();

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
        let idmap = {};
        let lower = {};
        let upper = {};
        let other = [];

        for (let c of this.constraints.constraints) {
            let a = c.lower;
            let b = c.upper;

            if (a.isParam()) idmap[a.id] = a;
            if (b.isParam()) idmap[b.id] = b;

            if (a.isParam() && b.isConcrete()) {
                lower[a.id] = (a.id in lower) ? glb(lower[a.id], b) : b;
            } else if (b.isParam() && a.isConcrete()) {
                upper[b.id] = (b.id in upper) ? lub(upper[b.id], a) : a;
            } else {
                other.push(c);
            }
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
        let map = {};

        function addToMap(p, t) {
            map[p.id] = (t.isParam() && t.id in map) ? map[t.id] : t;
        }

        let cs = this.constraints.constraints;
        let lowerParam = cs.filter(c => c.lower.isParam() && !c.lower.noreduce);
        let upperParam = cs.filter(c => c.upper.isParam() && !c.upper.noreduce);

        lowerParam.forEach(c1 => {
            upperParam.forEach(c2 => {
                if (c1.lower.equals(c2.upper) && c1.upper.equals(c2.lower)) {
                    addToMap(c1.lower, c1.upper);
                }
            });
        });

        let [n, p] = this.polarity();
        let negVar = n.filter(v => !p.some(x => x.equals(v))); // negative-only params
        let posVar = p.filter(v => !n.some(x => x.equals(v))); // positive-only params

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
        let params = this.arg.harvest().concat(this.out.harvest()).concat(this.errors);

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
        let neg = this.arg.harvest();
        let pos = this.out.harvest().concat(this.errors);

        let changed = true;
        let negDefs = this.constraints.constraints.filter(c => c.lower.isParam()).map(c => [c.lower, c.upper.harvest()]);
        let posDefs = this.constraints.constraints.filter(c => c.upper.isParam()).map(c => [c.upper, c.lower.harvest()]);

        while (changed) {
            changed = false;

            let extraNeg = negDefs.filter(([a, b]) => neg.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !neg.some(p => p === x));
            let extraPos = posDefs.filter(([a, b]) => pos.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !pos.some(p => p === x));

            if (extraNeg.length > 0 || extraPos.length > 0) {
                changed = true;
                neg = neg.concat(extraNeg);
                pos = pos.concat(extraPos);
            }
        }

        return [neg, pos];
    }

    sanitize() {
        let map = {};
        let arg = this.arg.sanitize(map);
        let out = this.out.sanitize(map);
        let constraints = this.constraints.sanitize(map);
        let errors = this.errors.map(e => e.sanitize(map));

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

    if (hasNames(a) && hasNames(b)) {
        let na = a.names;
        let nb = b.names;
        return createNamedType(na.concat(nb.filter(n => na.indexOf(n) < 0)));
    }

    if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) {
        let map = {};
        b.keys.filter(k => a.keys.indexOf(k) >= 0).forEach(k => {
            map[k] = lub(a.vals[k], b.vals[k]);
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
        let map = {};
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

    if (hasNames(a) && hasNames(b)) {
        let names = a.names.filter(t1 => b.names.some(t2 => t1 == t2));
        if (names.length > 0) {
            return createNamedType(names);
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
        let map = {};
        a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
        b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

        return new RecordType(map);
    }

    if (a instanceof RecordType && b instanceof RecordType) {
        let map = {};
        a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
        b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

        return new RecordType(map);
    }

    throw new Error(`No greatest lower bound of "${a.toString()}" and "${b.toString()}".`);
}

function hasNames(t) {
    return (t instanceof NamedType || t instanceof SumType);
}

function createNamedType(names) {
    if (names.length == 1) {
        return new NamedType(names[0]);
    }

    return new SumType(names);
}
