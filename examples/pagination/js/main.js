//
// Caching

var cache = {};

const lookup = new LiftedArrow(key => {
    /* @arrow :: 'a ~> 'b \ ({}, { 'a }) */
    if (key in cache) {
        return cache[key];
    }

    throw key;
});

const store = new LiftedArrow((key, value) => {
    /* @arrow :: ('a, 'b) ~> _ */
    cache[key] = value;
});

//
// Ajax Request

const ajax = new AjaxArrow((query, page) => {
    /* @conf :: (String, Number)
     * @resp :: {query: String, prev: Number, next: Number, results: [{id: Number, name: String, category: String, sub_category: String, price_per_unit: Number, margin: Number}], rangeLeft: Number, rangeRight: Number, count: Number} */
    return {
        'url'     : 'http://localhost:8080?q=' + query + '&page=' + page,
        'dataType': 'json'
    };
});

const ajaxOrCached = lookup.catch(
    ajax.carry().seq(store.remember()).nth(2)
);

//
// Ajax Result Handling

const handle = new LiftedArrow((results, rangeLeft, rangeRight, count) => {
    /* @arrow :: ([{id: Number, name: String, category: String, sub_category: String, price_per_unit: Number, margin: Number}], Number, Number, Number) ~> _ */
    $('#results tbody').empty();

    $('#meta').text('Displaying ' + rangeLeft + '-' + rangeRight + ' of ' + count);

    for (let row of results) {
        let tr = $('<tr />');
        for (let field of ['id', 'name', 'category', 'sub_category', 'price_per_unit', 'margin']) {
            tr.append($('<td />').text(row[field]));
        }

        $('#results tbody').append(tr);
    }
});

//
// Data Routing

const initPage = new LiftedArrow(() =>
    /* @arrow :: _ ~> Number */
    0
);

const getVal = new LiftedArrow((elem, event) =>
    /* @arrow :: (Elem, Event) ~> String */
    $(elem).val()
);

const extractQuery = new LiftedArrow(x =>
    /* @arrow :: {query: String} ~> String */
    x.query
);

const extractPrev = new LiftedArrow(x =>
    /* @arrow :: {prev: Number} ~> Number */
    x.prev
);

const extractNext = new LiftedArrow(x =>
    /* @arrow :: {next: Number} ~> Number */
    x.next
);

const extractResults = new LiftedArrow(x =>
    /* @arrow :: {results: [{id: Number, name: String, category: String, sub_category: String, price_per_unit: Number, margin: Number}], rangeLeft: Number, rangeRight: Number, count: Number} ~> ([{id: Number, name: String, category: String, sub_category: String, price_per_unit: Number, margin: Number}], Number, Number, Number) */
    [x.results, x.rangeLeft, x.rangeRight, x.count]
);

//
// Arrow Composition

// Build an arrow that executes main. Will attempt to execute task,
// but will abandon execution of task if main makes progress.

const runFirstIfPossible = (task, main) => Arrow.any([
    task.noemit().remember().seq(main),
    main,
]);

const paging = Arrow.fix(a => Arrow.seq([
    // Fetch current page. Load + Store from/to cache where possible.
    Arrow.id()
        .tap(() => $('.paging-control').addClass('disabled'))
        .seq(ajaxOrCached)
        .tap(() => $('.paging-control').removeClass('disabled')),

    // Extract relevant bits of response, modify DOM. Returns pagination
    // cursors and some junk from handle (unused).
    Arrow.fanout([
        Arrow.fanout([extractQuery, extractPrev]),
        Arrow.fanout([extractQuery, extractNext]),
        extractResults.seq(handle),
    ]),

    runFirstIfPossible(
        // Prefetch next set of results (may be cache hit if we went backwards in
        // the result set for some amount of time, should be no-op-ish). Note: We
        // may want to prefetch prev in some cases as well (user was linked into
        // the middle of a result set).
        Arrow.seq([new NthArrow(2), ajaxOrCached]),

        // Block until button click. Pass next or prev pagination cursor back into
        // the arrow. The content should change almost immediately because we've
        // put the next set of results into the cache before this point.
        Arrow.any([
            new NthArrow(1).triggeredBy('#prev', 'click'),
            new NthArrow(2).triggeredBy('#next', 'click'),
        ])
    ),

    // Repeat, ad nauseum.
    a,
]));

const filtering = Arrow.fix(a => new ElemArrow('#filter').on('keyup',
    Arrow.fanout([getVal, initPage]).seq(paging.after(400).noemit().any(a))
));

filtering.run();
