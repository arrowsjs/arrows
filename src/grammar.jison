%lex
%%

"~>"                      return '~>'
"<="                      return '<='
"\\"                      return '\\'

"_"                       return '_'
"("                       return '('
")"                       return ')'
"<"                       return '<'
">"                       return '>'
"["                       return '['
"]"                       return ']'
"{"                       return '{'
"}"                       return '}'
","                       return ','
":"                       return ':'
"+"                       return '+'
"'"                       return "'";

[_a-zA-Z][_a-zA-Z0-9]*    return 'IDENT'
\s+                       /* skip */
<<EOF>>                   return 'EOF'
.                         return 'INVALID'

/lex

%start top

%%

top
    : type annotations EOF            { return [$1, $2];     }
    | type '~>' type annotations EOF  { return [$1, $3, $4]; }
    ;

type
    : IDENT                   { $$ = new NamedType($1);                           }
    | IDENT sum_tail          { $$ = new SumType([$1].concat($2));                }

    | '_'                     { $$ = new TopType();                               }
    | "'" IDENT               { $$ = new ParamType($2);                           }

    | '[' type ']'            { $$ = new ArrayType($2);                           }
    | '(' types ')'           { $$ = new TupleType($2);                           }
    | '<' named_types '>'     { $$ = new TaggedUnionType(pairsToMap($2));         }
    | '{' named_types '}'     { $$ = new RecordType(pairsToMap($2));              }
    ;

sum_tail
    : '+' IDENT           { $$ = [$2];            }
    | '+' IDENT sum_tail  { $$ = [$2].concat($3); }
    ;

types
    : type            { $$ = [$1];            }
    | type ',' types  { $$ = [$1].concat($3); }
    ;

named_types
    : IDENT ':' type                  { $$ = [[$1, $3]];            }
    | IDENT ':' type ',' named_types  { $$ = [[$1, $3]].concat($5); }
    ;

annotations
    :                                 { $$ = [[], []]; }
    | '\\' '(' bounds ',' throws ')'  { $$ = [$3, $5]; }
    ;

bounds
    : '{' '}'                   { $$ = [];              }
    | '{' bound '}'             { $$ = [$2];            }
    | '{' bound bound_tail '}'  { $$ = [$2].concat($3); }
    ;

throws
    : '{' '}'        { $$ = [];   }
    | '{' types '}'  { $$ = $2;   }
    ;

bound
    : type '<=' type  { $$ = new Constraint($1, $3); }
    ;

bound_tail
    : ',' bound             { $$ = [$2];            }
    | ',' bound bound_tail  { $$ = [$2].concat($3); }
    ;

%%

function pairsToMap(pairs) {
    var map = {};
    pairs.forEach(function(k) {
        if (k[0] in map) {
            throw new Error("Duplicate key in record type.");
        }

        map[k[0]] = k[1];
    });

    return map;
}
