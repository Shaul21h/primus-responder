var debug = require('debug')('primus-responder')
	, spark = require('./spark')
	, _primus
	, _deletes = 0;

/** PrivateFunction: requestFulfilled
 * A scoped version of `requestFulfilled` is passed along the "request" event
 * emitted by `dispatchRequest`.
 * The requestId available in the scope is used as responseId and is sent along
 * with the `data` argument.
 *
 * Parameters:
 *     (Object) data - Data to send with the response.
 */
function requestFulfilled(data) {
	debug('request fulfilled, send now response');

	this.spark.write({
		plugin: 'primus-responder'
		, responseId: this.requestId
		, data: data
	});
}

/** PrivateFunction: dispatchRequest
 * Dispatches a request on a response. A "request" event is emitted by the
 * spark object. That event contains the request data and a scoped reference
 * on the `requestFulfilled` function. The subject which reacts on the event
 * calls `requestFulfilled` to send a response related to this request.
 *
 * Parameters:
 *     (String) requestId -  An ID which identifies the request to dispatch.
 *     (Object) data - The request data.
 */
function dispatchRequest(requestId, data) {
	debug('dispatch request');

	var scope = {
			spark: this
			, requestId: requestId
		}
		, scopedRequestFulfilled = requestFulfilled.bind(scope);

	this.emit('request', data, scopedRequestFulfilled);
}

/** PrivateFunction: compactObject
 *  cleans nulls in object, preventing over-growth of  the object
 * 
 * Parameters:
 * 	(Object) object - object, from which we remove `null`, 
 * 	`undefined`,  `''` and `false` values
 */
function compactObject(object) {
	var keys = Object.keys(object);
	var copy = {};
        
        var key, datum;
        for (var i = 0, l = keys.length; i < l; i++) {
            key = keys[i];
            datum = object[key];
            if (datum) {
            	copy[key] = datum;
            }
        }

        return copy;
}

/** PrivateFunction: dispatchResponse
 * This dispatches a incoming response on a specific request. It expects a
 * `responseId` and searches a callback in the `responseCallbacks` object. If
 * present, it gets executed and the callback itself is deleted from
 * `responseCallbacks`.
 *
 * Parameters:
 *     (String) responseId -  An ID which identifies a callback which should be
 *                            executed as soon as a response for a specific
 *                            request arrives.
 *     (Object) data - The response data transmitted by the spark.
 */
function dispatchResponse(responseId, data) {
	debug('dispatch response');
	// ref for caching
	var responseCallbacks = this.responseCallbacks;

	var callback = responseCallbacks[responseId];

	if(callback) {
		responseCallbacks[responseId] = null;
		if (++_deletes > 32) {
			this.responseCallbacks = compactObject(responseCallbacks);
		}
		callback(data);
	}
}

function handleIncoming(request) {
	debug('processing incoming message');

	var proceed = true
		, data = request.data
		, spark = this;

	// Check if message contains PrimusResponder envelope
	if(data.plugin && data.plugin === 'primus-responder') {
		proceed = false;

		// Check if it is a request or a response and dispatch
		if(data.requestId) {
			dispatchRequest.call(spark, data.requestId, data.data);
		} else if(data.responseId) {
			dispatchResponse.call(spark, data.responseId, data.data);
		}
	}

	return proceed;
}


function PrimusResponder(primus) {
	debug('initializing primus-responder');
	_primus = primus;

	// Ensure `writeAndWait` is available for sparks on the server too.
	// Further wrap primus-responders spark initialiser to the existing one.
	var sparkInit = primus.Spark.prototype.initialise;
	primus.Spark.prototype.writeAndWait = spark.writeAndWait;
	primus.Spark.prototype.initialise = function() {
		spark.initialise.call(this);
		sparkInit.apply(this, arguments);
	};


	// Add the incomding transformer to handle PrimusResponder messages:
	primus.transform('incoming', handleIncoming);
}

module.exports = PrimusResponder;
