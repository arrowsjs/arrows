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
