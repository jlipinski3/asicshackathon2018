var url_param = function (name) { //quick function for parsing url params
	var results = new RegExp('[\?&#/]' + name + '=([^!&#]*)').exec(window.location.href);
	if (results) {
		return results[1] || 0;
	}
};

//MODULES BELOW

//SWAPPING VISIBLE CONTENT AND PUSHING TO BROWSER HISTORY
//immediately invoked using the config vars for what params to keep from url and the content area this should be used for. can be scaled.
var newview = (function (keep_params, content_box, default_params) {
	var url_params = function () { //grab url params to bring along for the ride
		var p = {};
		for (var x = 0; x < keep_params.length; x++) {
			if (url_param(keep_params[x])) {
				p[keep_params[x]] = url_param(keep_params[x]);
			}
		}
		return p;
	};

	var clean_params = function (dirty) { //rinse a set of params, only keeping what we want
		var p = {};
		for (var x = 0; x < keep_params.length; x++) {
			if (dirty[keep_params[x]]) {
				p[keep_params[x]] = dirty[keep_params[x]];
			}
		}
		return p;
	};

	//set some initial vars
	var landing_hash = decodeURIComponent(window.location.hash.substring(1)).toLowerCase().replace(/\s+/g, ''); //support "#" links as they are the nonjs fallback and should be treated as the primary (view) param
	var init_params = {};
	if (url_param("view")) {
		init_params.view = url_param("view");
	} else if (landing_hash !== "") {
		init_params.view = landing_hash;
	} //add "view" to init_params if it's defined
	$.extend(init_params, {
		modal: url_param("modal")
	}); //use the ?view param or the landing hash as the page param. view param takes precedence.
	var first_load = true; //for use below to set initial params and ensure that the url is replaced on the first load

	//put the set method up here on its own just for readability
	var set = function (params) { 
		//as pointed out above, params can be built out beyond just the "view" property
		var first_load_params = $.extend({}, default_params, url_params(), init_params); //baseline list of params. defaults + "keeper" url params + non-keeper init params
		var url_and_first_load = first_load ? first_load_params : url_params(); //if this is the first_load, use that. otherwise only use url params.
		params = first_load ? $.extend({}, first_load_params, params) : params; //critical for initial experience: need to merge any passed params into first_load stuff. goal here is for "params" to only include what is changing.

		var hist_params = history.pushState ? $.extend({}, url_and_first_load, params) : params; //if browser supports history object, we can carry url params with us and rewrite url with them
		state = $.extend(state, hist_params); //merge into state so we have a global truth for this session

		var title = document.title.split(" - ")[0]; //for compiling and rewriting title later

		//use params properties below because those reflect what's changing, whereas state has been carried through the entire flow.
		if (params.view) //"swap screen" functionality. this updates nav, hides everything except the section that matches view param, and sets a new browser window title.
		{
			var $section = (content_box.sections).filter("#" + params.view); //jquery pointer to the area specified in url
			var $nav_link = (content_box.nav).find("a[data-show='" + params.view + "']"); //jquery pointer to the nav link specified in url

			//to scale out and use url params to perform addl actions, then handle those params here
			if ($section.length) //before going forward, ensure there is a link and an area that matches the param
			{
				if (!$nav_link.is(":first-child") && !$nav_link.hasClass("active")) {
					(content_box.nav).addClass("responsive");
				} //if this isn't the first link in the nav AND the nav isnt already active (meaning this is a new page load) then add the responsive class to the nav so it's open on page load
				$(".active", content_box.nav).removeClass("active"); //remove all active links before setting a new active
				$nav_link.addClass("active"); //set current to active
				(content_box.sections).not("#" + params.view).hide(); //hide all sections that are not this one (using id attr)
				
				if(!params.refresh){ $section.fadeIn(300); } //if this has been passed with a refresh param, wait until the location refresh to show, because it will flicker

				//extra trigger stuff
				$(".filter_results", $section).each(function () { //iterate through and trigger barcode renderings for any barcodes in this section
					$(this).trigger("filter_products", [$(this)]);
				});
				
				title += (" - " + params.view); //compile new title
				document.title = title; //set page title using javascript, not supported by most browsers
			}
		}

		//after handling param events above, push params to browser history object below
		if (history.pushState && !state.nopush) //ensure browser supports pushState and this isn't a back or forward click
		{
			//prepare to push to browser history object
			var clean_url = $.extend({}, clean_params(state)); //duplicate the params object to allow for manipulation before sending to history object, and rinse
			var url_add = $.param(clean_url) + (landing_hash && landing_hash !== state.view ? "#" + landing_hash : "") + "!new"; //rebuild the query string, taking only what is desired and add "!new" so the browser registers a unique push
			var push_url = (location.protocol + '//' + location.host + location.pathname + (url_add !== "" ? "?" + url_add : "")); //rebuild the url using fresh parameterization
			state.title = title; //set the title of the page and save to history params

			if (landing_hash == state.view || first_load) //for a #view hash which is replaced to "?view" or this is a default_show
			{
				history.replaceState(state, title, push_url);
			} else if (!first_load) //if not the first load then proceed with the pushStates to modify the browser history
			{
				history.pushState(state, title, push_url);
			}
		} else if (state.hasOwnProperty("nopush")) {
			delete state.nopush;
		} //remove the nopush as it's only good for one-time use on a back/forward

		first_load = landing_hash = false; //clear these so we know app has been initialized and history rewriting can commence
		
		if(params.refresh){window.location.reload();} //full reload
	};
	
	return {
		set: set,
		clear: function (params) {
			state = {}; //clear state
			params = $.extend({}, default_params, params); //merge passed params into defaults and pass those
			(content_box.sections).hide(); //hide before resetting screen
			this.set(params); //reset using defaults and any manually passed params
		}
	};
})(config.keep_params, config.content_area, config.defaults);

//CREDS
//manages user access and sets/clears cookie
var creds = (function (login_screen_id) {
	var save_to_cookie = function () { //used for analytics tracking
		if (Cookies.enabled) {
			var analytics_stuff = {
				"store-id": state.store_id,
				"device-id": url_param("id"),
				"build": url_param("build"),
				"version": url_param("version")
			}; //save to cookie because oauth redirections restart browser session
			Cookies.set("oasis_analytics", JSON.stringify(analytics_stuff), {
				expires: new Date(new Date().setHours(27, 0, 0, 0))
			}); //cookie expires "27 hours from today at midnight" = tomorrow at 3am.
			return true;
		} else {
			alert("Cookies need to be enabled for this web application.");
			return false;
		}
	};

	return {
		track: save_to_cookie, //used for analytics
		check: function () {
			if (Cookies.enabled) {
				//check if "store" cookie exists and is not expired, which is set during oauth/api relay
				return Cookies.get("store");
			} else {
				alert("Cookies need to be enabled for this web application.");
				return false;
			}
		},
		destroy: function () { //expire all cookies and go to login screen
			if (Cookies.enabled) {
				Cookies.expire("store", {
					domain: env_config.cookie_domain
				});
				Cookies.expire("asics-idm-session", {
					domain: env_config.cookie_domain
				});
				Cookies.expire("oasis_analytics", {
					domain: env_config.cookie_domain
				});
			}
			newview.clear({
				view: login_screen_id
			}); //clear state and go to employee login, regardless of cookies
		}
	};
})(config.login_screen_id);