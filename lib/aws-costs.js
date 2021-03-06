//setup Dependencies
var awslib = require('aws-lib')
	, cloner = require('merger')
	, simpledb = require('simpledb/lib/simpledb');

// global var
var dataGrid = null;
var operationHistory = null;
var awsKey = null;
var awsSecretKey = null;
var simpledbKey = null;
var simpledbSecretKey = null;
var sdb = null;

// some constants for array indices
var ID = 0;
var STATE = 1;
var TYPE = 2;
var LAUNCH_TIME = 3;
var UPTIME = 4;
var CREATOR = 5;
var REASON = 6;
var NAME = 7;
var AGENCY = 8;
var OFFICE = 9;
var CLIENT = 10;
var PRODUCT = 11;
var COST = 12;
var MONTH_COST = 13;

// cost (if running)
// TODO: EC2 instance prices should be user configurable
// so that code doesn't need to change when AWS changes prices
var ec2Prices = [
	{ name: "c1.medium", price:  .29 },
	{ name: "m1.large",  price:  1.08 },
	{ name: "m1.small",  price:  .12 },
	{ name: "m1.xlarge", price:  .96 },
	{ name: "m2.2xlarge",price: 1.24 },
	{ name: "m2.xlarge", price:  .62 }
];

var refreshDataGrid = function() {
	ec2 = awslib.createEC2Client(awsKey,awsSecretKey, {secure: false});
	ec2.call("DescribeInstances", {}, function(result) {

		var rows = [];
		for (var i = 0; i < (result['reservationSet']['item']).length; i++) {
			var instanceProperties = result['reservationSet']['item'][i]['instancesSet']['item']; 

			// populate all cells in a row
			var cells = [];

			// instance id
			cells[ID] = instanceProperties['instanceId'];

			// instance state (running, stopped, or terminated)
			cells[STATE] = (instanceProperties['instanceState']) ? instanceProperties['instanceState']['name'] : "";

			// instance type (e.g. m1.large)
			cells[TYPE] = instanceProperties['instanceType'];

			// start date (in local time zone)
			var startDate = new Date(instanceProperties['launchTime']);
			cells[LAUNCH_TIME] = startDate.toLocaleString();

			// uptime (in months, days, hours, and minutes)
			var now = new Date();
			var msecPerMonth = 1000 * 60 * 60 * 24 * 30.33333333333;
			var msecPerDay = 1000 * 60 * 60 * 24;
			var msecPerHour = 1000 * 60 * 60;
			var msecPerMinute = 1000 * 60;
			var msecUp = now - startDate;
			var months = Math.floor(msecUp / msecPerMonth);
			var days = Math.floor((msecUp - (months * msecPerMonth)) / msecPerDay);
			var hours = Math.floor((msecUp - (months * msecPerMonth) - (days * msecPerDay)) / msecPerHour);
			var minutes = Math.floor((msecUp - (months * msecPerMonth) - (days * msecPerDay) - (hours * msecPerHour)) / msecPerMinute);
			cells[UPTIME] = (months==0 ? "" : months + "m") +
							(days==0 ? "" : days + "d") +
							(hours==0 ? "" : hours + "h") +
							(minutes==0 ? "" : minutes + "m");

			// creator
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Created By') {
						cells[CREATOR] = typeof(instanceProperties['tagSet']['item'][j]['value']) ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[CREATOR] = "";
			}
				
			// stop or terminate reason
			cells[REASON] = typeof(instanceProperties['reason']) == "string" ? instanceProperties['reason'] : "";
			
			// specify name
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Name') {
						cells[NAME] = typeof(instanceProperties['tagSet']['item'][j]['value']) ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[NAME] = "";
			}
			
			// specify agency
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Agency') {
						cells[AGENCY] = typeof(instanceProperties['tagSet']['item'][j]['value']) ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[AGENCY] = "";
			}
			
			// specify office
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Office') {
						cells[OFFICE] = typeof(instanceProperties['tagSet']['item'][j]['value']) == "string" ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[OFFICE] = "";
			}		
				
			// specify client
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Client') {
						cells[CLIENT] = typeof(instanceProperties['tagSet']['item'][j]['value']) == "string" ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[CLIENT] = "";
			}
						
			// specify product
			if (instanceProperties['tagSet']) {
				for (j = 0; j < (instanceProperties['tagSet']['item']).length; j++) {
					if (instanceProperties['tagSet']['item'][j]['key'] == 'Product') {
						cells[PRODUCT] = typeof(instanceProperties['tagSet']['item'][j]['value']) == "string" ?
											instanceProperties['tagSet']['item'][j]['value'] :
											"";
					}
				}
			} else {
				cells[PRODUCT] = "";
			}
			
			// specify price
			var price = 0;
			for (var k = 0; k < ec2Prices.length; k++) {
				if (cells[TYPE] == ec2Prices[k].name) price = ec2Prices[k].price;
			}
			
			// specify total cost
			getEc2Cost(result['reservationSet']['item'][i]['instancesSet']['item']['instanceId'],
						{price: price},
						function(instanceId, calculatedCost) {
							var id = instanceId;
							for (var x = 0; x < dataGrid.rows.length; x++) {
								if (dataGrid.rows[x].cell[ID] == id) {
									dataGrid.rows[x].cell[COST] = calculatedCost;
									console.log("instanceId " + id + " cost:   " + calculatedCost)
								}
							}
						});
			
			// specify month-to-date cost
			getEc2Cost(result['reservationSet']['item'][i]['instancesSet']['item']['instanceId'],
						{price: price,
						 startDate: new Date((new Date()).setDate(1))
						},
						function(instanceId, calculatedCost) {
							var id = instanceId;
							for (var x = 0; x < dataGrid.rows.length; x++) {
								if (dataGrid.rows[x].cell[ID] == id) {
									dataGrid.rows[x].cell[MONTH_COST] = calculatedCost;
									console.log("instanceId " + id + " cost:   " + calculatedCost)
								}
							}
						});
									
			// add cells to row object
			var row = {
				id: instanceProperties['instanceId']
				,cell: cells
			};

			// add row to rows object
			if (row.cell[ID] && row.cell[ID] != "") rows.push(row);
		}

		// add current page number, total row count, and rows to dataGrid object
		dataGrid = {
			page: 1
			,total: (result['reservationSet']['item']).length
			,rows: rows
		};
		console.log("dataGrid refreshed.");
	});
}

var getEc2Cost = function(instanceId, props, callback) {
	var startDate = props.startDate || (new Date(1995, 0, 1)).getTime(); // default date is sometime before the internet...
	getInstanceHistory(instanceId, function(result) {
		var milliseconds = 0;
		for (var z = 1; z < result.length; z++) {
			currentItem = result[z];
			priorItem = result[z-1];
			if (currentItem.action == 'stopped' || currentItem.action == 'terminated') {
				if (priorItem.action == 'started' || priorItem.action == 'created') {
					if (currentItem.date >= startDate){
						var theDate = (priorItem.date < startDate) ? startDate : priorItem.date;
						milliseconds = milliseconds + (currentItem.date - theDate);
					}
				}
			}
		}
		// handle case where last (or first and only) action is 'started' or 'created'
		if (result.length != 0) {
			var finalItem = result[result.length-1];
			if (finalItem.action == 'started' || finalItem.action == 'created') {
				var theDate = (finalItem.date < startDate) ? startDate : finalItem.date;
				milliseconds = milliseconds + ((new Date()).getTime() - theDate);
			}
		}
		var hours = Math.ceil(milliseconds / 1000 / 60 / 60);
		var cost = (hours * parseFloat(props.price)).toFixed(2);
		callback(instanceId, cost);
	});
};

// returns create, start, stop, and terminate history of
// an instance in an Array sorted by date in ascending order
var getInstanceHistory = function(instanceId, callback) {
	var query = "select * from VncAwsOperationHistory where Message like '%" + instanceId + "%' limit 2500";
	sdb.select(query, function(err, result) {
		var history = [];
		var regExp = new RegExp(/(created)|(started)|(stopped)|(terminated)/);
		for (var y = 0; y < result.length; y++) {
			var date = (new Date(result[y].Date)).getTime();
			var action = regExp.exec(result[y].Message) ? regExp.exec(result[y].Message)[0] : null
			if (action) history.push({ date: date, action: action });
		}
		history.sort(function(a,b) {
			// sort array by date in ascending order
			return a.date - b.date;
		});
		callback(history);
	});
};

// uncomment this and update the instance id and price to test a specific instance in log
/*
getEc2Cost('i-30194a5d', {price: .48}, function(instanceId,cost) {
	console.log("cost is " + cost);
});
*/

exports.runDataRefresh = function(props, interval) {
	awsKey = props.key;
	awsSecretKey = props.secretKey;
	simpledbKey = props.sdbKey;
	simpledbSecretKey = props.sdbSecretKey;
	sdb = new simpledb.SimpleDB({keyid: simpledbKey, secret: simpledbSecretKey});
	try {
		refreshDataGrid();
		setInterval(refreshDataGrid, interval);
	} catch(err) {
		console.error("Error refreshing dataGrid: " + err);
	}
};

exports.getInstances = function(queryObj, callback) {
	// make a clone of the dataGrid so that we can sort it and handle paging without
	// getting in the way of any updates that might happen from runDataRefresh
	var dataGridCopy = cloner.clone(dataGrid);
	
	// get sort and paging parameters
	var page = parseInt(queryObj.page);
	var rp = parseInt(queryObj.rp);
	var sortname = queryObj.sortname;
	var sortorder = queryObj.sortorder;
	var query = queryObj.query;
	var qtype = queryObj.qtype;
	
	// apply query to filter data
	if (query && query != "" & query !== "undefined") {
		for (var p = 0; p < (dataGridCopy.rows).length; p++) {
			if (dataGridCopy.rows[p].cell[11] != query) {
				console.log("removing instance " + dataGridCopy.rows[p].cell[ID] + ". query: " + query + "| data: " + dataGridCopy.rows[p].cell[11]);
				dataGridCopy.rows.splice(p,1);
			} else {
				console.log("leaving instance " + dataGridCopy.rows[p].cell[ID] + ". query: " + query + "| data: " + dataGridCopy.rows[p].cell[11]);
			}
		}
	}
	
	// set summary info in dataGridCopy object
	dataGridCopy.page = page;
	dataGridCopy.total = (dataGridCopy.rows).length;
		
	// sort rows array
	dataGridCopy.rows.sort(function(a,b) {
		var diff = 0;
		switch(sortname) {
			case 'instanceId':
				if (!a.cell[ID] || !b.cell[ID]) { diff = -1; break; }
				if (!a.cell[ID] && !b.cell[ID]) { diff = 0; break; }
				if (a.cell[ID].toLowerCase() < b.cell[ID].toLowerCase()) { diff = -1; }
				else if (a.cell[ID].toLowerCase() > b.cell[ID].toLowerCase()) { diff = 1; }
				break;
			case 'instanceState':
				if (!a.cell[STATE] || !b.cell[STATE]) { diff = -1; break; }
				if (!a.cell[STATE] && !b.cell[STATE]) { diff = 0; break; }
				if (a.cell[STATE].toLowerCase() < b.cell[STATE].toLowerCase()) { diff = -1; }
				else if (a.cell[STATE].toLowerCase() > b.cell[STATE].toLowerCase()) { diff = 1; }
				break;
			case 'instanceType':
				if (!a.cell[TYPE] || !b.cell[TYPE]) { diff = -1; break; }
				if (!a.cell[TYPE] && !b.cell[TYPE]) { diff = 0; break; }
				if (a.cell[TYPE].toLowerCase() < b.cell[TYPE].toLowerCase()) { diff = -1; }
				else if (a.cell[TYPE].toLowerCase() > b.cell[TYPE].toLowerCase()) { diff = 1; }
				break;
			case 'launchTime':
				diff = (new Date(a.cell[LAUNCH_TIME]) - new Date(b.cell[LAUNCH_TIME]));
				break;
			case 'uptime':
				diff = (new Date(b.cell[LAUNCH_TIME]) - new Date(a.cell[LAUNCH_TIME]));
				break;
			case 'createdBy':
				if (!a.cell[CREATOR] || !b.cell[CREATOR]) { diff = -1; break; }
				if (!a.cell[CREATOR] && !b.cell[CREATOR]) { diff = 0; break; }
				if (a.cell[CREATOR].toLowerCase() < b.cell[CREATOR].toLowerCase()) { diff = -1; }
				else if (a.cell[CREATOR].toLowerCase() > b.cell[CREATOR].toLowerCase()) { diff = 1; }
				break;
			case 'reason':
				if (!a.cell[REASON] || !b.cell[REASON]) { diff = -1; break; }
				if (!a.cell[REASON] && !b.cell[REASON]) { diff = 0; break; }
				if (a.cell[REASON].toLowerCase() < b.cell[REASON].toLowerCase()) { diff = -1; }
				else if (a.cell[REASON].toLowerCase() > b.cell[REASON].toLowerCase()) { diff = 1; }
				break;
			case 'name':
				if (!a.cell[NAME] || !b.cell[NAME]) { diff = -1; break; }
				if (!a.cell[NAME] && !b.cell[NAME]) { diff = 0; break; }
				if (a.cell[NAME].toLowerCase() < b.cell[NAME].toLowerCase()) { diff = -1; }
				else if (a.cell[NAME].toLowerCase() > b.cell[NAME].toLowerCase()) { diff = 1; }
				break;
			case 'agency':
				if (!a.cell[AGENCY] || !b.cell[AGENCY]) { diff = -1; break; }
				if (!a.cell[AGENCY] && !b.cell[AGENCY]) { diff = 0; break; }
				if (a.cell[AGENCY].toLowerCase() < b.cell[AGENCY].toLowerCase()) { diff = -1; }
				else if (a.cell[AGENCY].toLowerCase() > b.cell[AGENCY].toLowerCase()) { diff = 1; }
				break;
			case 'office':
				if (!a.cell[OFFICE] || !b.cell[OFFICE]) { diff = -1; break; }
				if (!a.cell[OFFICE] && !b.cell[OFFICE]) { diff = 0; break; }
				if (a.cell[OFFICE].toLowerCase() < b.cell[OFFICE].toLowerCase()) { diff = -1; }
				else if (a.cell[OFFICE].toLowerCase() > b.cell[OFFICE].toLowerCase()) { diff = 1; }
				break;
			case 'client':
				if (!a.cell[CLIENT] || !b.cell[CLIENT]) { diff = -1; break; }
				if (!a.cell[CLIENT] && !b.cell[CLIENT]) { diff = 0; break; }
				if (a.cell[CLIENT].toLowerCase() < b.cell[CLIENT].toLowerCase()) { diff = -1; }
				else if (a.cell[CLIENT].toLowerCase() > b.cell[CLIENT].toLowerCase()) { diff = 1; }
				break;
			case 'product':
				if (!a.cell[PRODUCT] || !b.cell[PRODUCT]) { diff = -1; break; }
				if (!a.cell[PRODUCT] && !b.cell[PRODUCT]) { diff = 0; break; }
				if (a.cell[PRODUCT].toLowerCase() < b.cell[PRODUCT].toLowerCase()) { diff = -1; }
				else if (a.cell[PRODUCT].toLowerCase() > b.cell[PRODUCT].toLowerCase()) { diff = 1; }
				break;
			case 'cost':
				diff = parseFloat(a.cell[COST]) - parseFloat(b.cell[COST]);
				if (isNaN(b.cell[COST])) diff = 1;
				break;
			case 'monthCost':
				diff = parseFloat(a.cell[MONTH_COST]) - parseFloat(b.cell[MONTH_COST]);
				if (isNaN(b.cell[MONTH_COST])) diff = 1;
				break;
		}
		if (sortorder == 'desc') diff = diff * -1;
		return diff;
	});
	
	// get only requested row count and page
	var newRows = [];
	var startRow = rp * (page - 1);
	var endRow = (rp * page) - 1;
	var totalCost = 0;
	var monthCost = 0;
	for (var k = 0; k < (dataGridCopy.rows).length; k++){
		if (k >= startRow && k <= endRow) {
			newRows.push(dataGridCopy.rows[k]);
		}
		totalCost = totalCost + parseFloat(dataGridCopy.rows[k].cell[COST]);
		monthCost = monthCost + parseFloat(dataGridCopy.rows[k].cell[MONTH_COST]);
	}
	
	dataGridCopy.rows = newRows;
	dataGridCopy.totalCost = "$" + addCommas(totalCost.toFixed(0));
	dataGridCopy.monthCost = "$" + addCommas(monthCost.toFixed(0));
	
	// send data to caller
	console.log(dataGridCopy);
	callback(dataGridCopy);
};

function addCommas(nStr)
{
	nStr += '';
	x = nStr.split('.');
	x1 = x[0];
	x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}
