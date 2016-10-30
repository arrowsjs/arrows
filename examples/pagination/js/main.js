// _benchmarkStart(true);

//
// Caching

const cache = {};

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
        'url'     : 'http://arrows.eric-fritz.com:8080?q=' + query + '&page=' + page,
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

    Arrow.any([
        // Block until the user clicks the prev button, then cancel any
        // in-flight pre-fetch of the next page.
        new NthArrow(1).triggeredBy('#prev', 'click'),

        // Otherwise, begin a pre-fetch of the next page and wait for a
        // click of the next button to display it. The pre-fetch will
        // place the arrow in the cache so that it's immediately available
        // on the next iteration.
        new NthArrow(2).seq(Arrow.fanout([
            ajaxOrCached,
            Arrow.id().triggeredBy('#next', 'click')
        ]).noemit().remember())
    ]),

    // Repeat, ad nauseum.
    a,
]));

_benchmarkResultsOrRun(Arrow.fix(a => new ElemArrow('#filter').on('keyup',
    Arrow.fanout([getVal, (0).lift()]).seq(paging.after(400).noemit().any(a))
)));
