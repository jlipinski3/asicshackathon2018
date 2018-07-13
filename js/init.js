//constants to be used when invoking and initializing objects/functions
//the screens are set here because some events need to proceed to particular screens based on actions

var config = {
	defaults: {
	},
	keep_params: ["style", "client_id", "view", "locale", "connection", "device_id"],
	content_area: {},
	screens: ["swiper"]
};
var state = {};

(function () {
	jQuery(function ($) {
		config.content_area.nav = $("#topnav nav"); //nav menu
		config.content_area.sections = $("main #main_inside section"); //content area with articles
		config.defaults.view = (config.content_area.nav).find("a").first().data("show"); //if no view param, show this first
		(config.content_area.nav).removeClass("responsive").removeClass("nojs"); //remove these classes for "hamburger" menu functionality with javascript
		//some history api assistance for back and forward buttons
		window.onpopstate = function (event) { //"onpopstate" is fired when using the browser back and forward buttons. add a "nopush" property to state when passing to newview so the back and forward actions dont append to state, but instead allow the user to traverse existing state.
			if (event && event.state) {
				clone_state = $.extend({}, event.state); //must do this for IE since it doesn't allow manipulation of event.state object
				if (clone_state.view) {
					clone_state.nopush = true;
				}
				newview.set(clone_state);
			} else if ('state' in window.history) {
				window.location.reload();
			} //reload if using a hard server param like "?param="
		};

		//BINDERS FOR INTERACTIVITY
		$("#main_inside").removeClass("nojs"); //remove nojs class to adjust padding, borders, etc

		//add these binders to content_area.sections with additional selectors because some of these elements are modified/added/removed (such a pikaday) when translating. need to keep entire content_area event scope.
		(config.content_area.sections).on("focus", (".floating-label, input, select", ".focus_blur"), function (e) { //for moving input text from inside to above the input
			$(this).closest(".input_outer_container").addClass("focus");
		});
		(config.content_area.sections).on("blur", (".floating-label, input, select", ".focus_blur"), function (e) { //put text back inside
			$this_field = $("input, select", $(this));
			if (($this_field.is("input[type=text], input[type=email]") && ($this_field.val() === "" || $(this).closest(".input_outer_container").hasClass("valid"))) || !$this_field.is("input[type=text], input[type=email]")) //only remove focus on input text if not empty or has a valid class assigned to it
			{
				$(this).closest(".input_outer_container").removeClass("focus");
			}

			if (errors.validate($this_field)) {
				analytics.logger({
					"event-name": $this_field.attr("id") + "-entered"
				});
			} //validate when clicking off or moving to next field and log analytics if valid
		});

		(config.content_area.sections).on("change keyup paste", "input.required, select.required, input.validate, select.validate", function (e) { //validate
			errors.validate($(this));
		});

		(config.content_area.sections).on("click", "input[type=submit]", function (e) { //compile inputs using the data-form attribute to create payload. send to API endpoint and if successful, proceed to next screen as specified in data-show attribute
			e.preventDefault();

			//grab serializedArray of form data, to manipulate
			var payload = $("[data-form='" + $(this).data("form") + "']").serializeArray(); //convert form data to array
			payload.push({
				name: "language",
				value: (state.locale).split("-")[0]
			}); //add language as the first two letters of the locale

			payload.forEach(function (v, k, the_payload) { //manipulate any values before sending
				if (v.name === "a_birth") //hacky, for pikaday: format date from locale specific format
				{
					the_payload[k] = {name: "a_birth", value: moment(v.value, config.date_format_display).format(config.date_format_stored)};
				}
			});

			//console.log($.param(payload));
			
			$(".error.non_ui", "#" + state.view).hide(); //clear server (non-user validation) errors
			var show_screen = $(this).data("show"); //need to set this here because of scope within ajax
			var $button = $(this);
			
			if (errors.is_happy("#" + state.view) && !$button.hasClass("in_progress")) //check if any errors associated with this view and make sure call is not in progress
			{
				$.ajax({
					data: $.param(payload),
					url: env_config.endpoints[$(this).data("form")],
					method: "POST",
					cache: false,
					dataType: "json",
					crossDomain: true,
					xhrFields: {
						withCredentials: true
					},
					beforeSend: function(){
						$button.addClass("in_progress");
					}
				}).done(function (data) { //handle successful api response
					if (data.hasOwnProperty("barcode")) {
						state.barcode_customer = data.barcode;
						if (data.barcode !== null) //user created successfully
						{
							if(data.hasOwnProperty("id")){ state.asics_id = data.id; }//id is asics_id, to be used for analytics

							analytics.logger({
								"event-name": $(this).data("new-user-created")
							});
							newview.set({
								view: show_screen
							}); //go to barcode screen, show barcode
						} else { //barcode not returned, but server call came back. show server error and allow user to try again.
							$(".error.error_server", "#" + state.view).show();
						}
					}
				}).fail(function (jqXHR, textStatus, error) { //handle fail response
					$(".error.error_server", "#" + state.view).show();
					analytics.log_all_errors();
				}).always(function(){
					$button.removeClass("in_progress"); //remove call effect
				});
			}
			
			if ($(this).attr("data-eventname")) {
				analytics.logger({
					"event-name": $(this).data("eventname")
				});
			} //log click event if data-eventname attached
		});

		//when hitting enter, trigger a click to the submit button (if only one exists in this section)
		(config.content_area.sections).on("keypress", function (e) {
			$submit_button = $("[type=submit]", "#" + state.view); //identify the submit input or button used for this view
			if (e.which == 13 && $submit_button.length === 1) {
				e.preventDefault();
				$submit_button.trigger("click");
			}
		});

		//TRIGGERS BELOW, IN ORDER OF FLOW
		//for populating store ids on the employee signin page. Run at startup.
		$(document).on("fetch_stores", function (e, dropdown) {
			e.preventDefault();

			var store_replace = function (data) {
				$("option:not(:first)", dropdown).remove(); //remove all but first value, since that's default with help text
				$.each(data, function (k, v) { //iterate through list of stores
					dropdown.append($("<option>", {
							value: v,
							text: k
						})); //apply key-value pairs to option value and text
				});
			};

			$(".error.non_ui", "#" + state.view).hide(); //hide server error when doing a new store fetch

			if(!dropdown.parents(".input_outer_container").find(".loading").length) //only kick off a new store fetch when there's not one already loading
			{
				$.ajax({
					url: env_config.endpoints.employee_signin,
					method: "GET",
					cache: false, //necessary since this is a get
					dataType: "json",
					beforeSend: function () {
						//add loading message
						dropdown.parents(".input_outer_container").find(".input_container, .input_underline").hide();
						dropdown.parents(".input_outer_container").append("<div class='loading'>LOADING</div>");
					}
				}).done(function (data) {
					store_replace(data);
				}).fail(function () {
					console.log("failed to receive list of stores");
					$(".error.error_server", "#" + state.view).show();
					analytics.log_all_errors();
				}).always(function () {
					//remove loading message
					dropdown.parents(".input_outer_container").find(".loading").remove();
					dropdown.parents(".input_outer_container").find(".input_container, .input_underline").show();
				});
			}
		});

		$(document).on("login", function (e) {
			e.preventDefault();
			
			$(".error.non_ui", "#" + state.view).hide(); //clear server (non-user validation) errors
			
			if (errors.is_happy("#" + state.view)) //check if any errors associated with this view
			{
				var state_redirect = (window.location.href).replace(config.login_screen_id, config.email_entry_screen); //replace login_screen_id with email_entry_screen for redirect_uri
				window.location = env_config.oauth_url + "?email=" + encodeURIComponent(state.store_email) + "&grant_type=code&client_id=oasis&style=oasis&redirect_uri=" + encodeURIComponent(env_config.oauth_redirect_uri) + "&state=" + encodeURIComponent(state_redirect); //pass true redirect as state
			}
		});

		$(document).on("check_user", function (e, $button) { //handle email submission by checking if user exists and go straight to barcode if exists, otherwise proceed to capture customer info
			e.preventDefault();
			form_data = $.param($("#a_email")); //serialized
			payload = $.deparam(form_data); //convert to json
			payload.language = (state.locale).split("-")[0]; //separate language from country
			delete payload[""]; //remove any blank keys...if they're blank, they aren't important

			$(".error.non_ui", "#" + state.view).hide(); //clear server (non-user validation) errors

			if (errors.is_happy("#" + state.view) && !$button.hasClass("in_progress")) //check if any errors associated with this view and call is not in progress
			{
				$.ajax({
					data: payload,
					url: env_config.endpoints.check_user,
					method: "GET",
					cache: false, //necessary since this is a get
					dataType: "json",
					crossDomain: true,
					xhrFields: {
						withCredentials: true
					},
					beforeSend: function(){
						$button.addClass("in_progress"); //call in progress effect
					}
				}).done(function (data) {
					//API CALL RESPONSE
					if (data.hasOwnProperty("barcode")) {
						state.barcode_customer = data.barcode; //use this to know that the user check was performed
						
						if (data.barcode !== null) //user exists!
						{
							//immediately proceed to go, collect $200...
							//go straight to customer success screen (screen 5)
							state.user = "exists"; //for analytics
							if(data.hasOwnProperty("id")){ state.asics_id = data.id; }//id is asics_id, to be used for analytics
							
							newview.set({
								view: config.customer_found_screen
							}); //go to barcode screen, show barcode
						} else { //user does not exist, so bring them to registration flow
							if(data.hasOwnProperty("info") && data.info !== null) //this is a half-created user
							{
								state.user = "exists"; //for analytics
								
								//prepopulate data-form='customer_info' inputs with existing customer data
								prepopulate.by_data_form("customer_info", data);
							} else {
								state.user = "new"; //for analytics
							}
							
							newview.set({
								view: config.registration_screen
							}); //proceed to customer form
						}
					}
				}).fail(function (jqXHR, textStatus, error) {
					//FAIL RESPONSE
					$(".error.error_server", "#" + state.view).show();
					analytics.log_all_errors();
				}).always(function(){
					$button.removeClass("in_progress");
				});
			}
		});

		//when barcode is triggered, generate into barcode box using passed selector. requires js. see https://github.com/lindell/JsBarcode
		$(document).on("barcode", function (e, barcode_img) {
			var barcode_id = barcode_img.attr("id"); //match barcode id up with barcode property, so this can scale to multiple barcodes if necessary

			if (state.hasOwnProperty(barcode_id) && state[barcode_id] !== "") //show and generate barcode if value exists
			{
				barcode_img.prop("alt", state[barcode_id]); //update alt attr with barcode id, used for unit test
				barcode_img.show();
				JsBarcode("#" + barcode_id, state[barcode_id], {
					format: "CODE39",
					font: "Graphik"
				});
			} else {
				barcode_img.hide();
			}
		});

		$(document).on("logout", function (e) {
			creds.destroy();
		});

		$(document).on("next_user", function (e) {
			newview.clear({ //use newview.clear to reset fields and clear any errors
				view: config.email_entry_screen,
				refresh: true
			});
		});

		//MODALS:
		//trigger to launch modal
		$(document).on("modal", function (e, modal) {
			modal.toggleClass("modalin");
			$("body").toggleClass("modalin");
			if (modal.hasClass("modalin")) {
				analytics.logger({
					"event-name": modal.data("eventname")
				});
			} //log analytics when modal is displayed

			//fetch html via ajax for terms of service and privacy policy modal
			if (modal.hasClass("tos") || modal.hasClass("privacy_policy")) {
				var tos_or_privacy = modal.hasClass("tos") ? "tos" : "privacy_policy";

				$.ajax({
					url: getVersionedFilename("data/translations/" + state.locale + "/oasis-" + tos_or_privacy + "_" + state.locale + ".html"), //use locale to specify subfolder and filename
					beforeSend: function (xhr) {
						if (xhr.overrideMimeType) {
							xhr.overrideMimeType("application/json");
						} //necessary for local debugging using file:// protocol
						$(".body_details", modal).html("<div class='loading'>LOADING</div>");
					},
					method: "GET",
					cache: false, //necessary since this is a get
					dataType: "html"
				}).done(function (data) {
					$(".body_details", modal).html(data);
					$(".body_details a", modal).contents().unwrap(); //remove links
				}).fail(function () {
					console.log("failed to load " + tos_or_privacy + " for " + state.locale);
				});
			}
		});

		//just add the "modal-toggle" class to any element to toggle open/close
		//TODO: look into why modal is not closing on ipad when clicking on background
		$(document).on("click", "a, .modal-toggle, button", function (e) {
			if ($(this).is("a") && $(this).attr("data-modal") || !$(this).is("a")) //anchor and button tags can launch modal using just data-modal attribute
			{
				e.preventDefault();
				if ($(this).parents('.modal').length) //click anything inside modal (including overlay) that has a .modal-toggle class
				{
					$(document).trigger("modal", [$(this).parents('.modal')]);
				} else if ($(this).attr("data-modal")) //toggle modal using data-modal attribute
				{
					$(document).trigger("modal", [$('.modal.' + $(this).data('modal'))]);
				}
			}
		});

		//intercept nav clicks below to toggle the hamburger menu and to show specific content using the data-show attribute, and fire analytics if attached
		$(document).on("click", "a, button, select, input[type=checkbox]", function (e) { //intercept anchor clicks and button clicks
			if ($(this).hasClass("dropdown")) //the hamburger icon has the dropdown class and will collapse or expand using the responsive class on the nav
			{
				e.preventDefault();
				(config.content_area.nav).toggleClass("responsive");
			} else {
				if ($(this).attr("data-show")) //pass the data-show active section function below
				{
					e.preventDefault();
					if (errors.is_happy("#" + state.view)) //if this button proceeds to the next screen, make sure there are no outstanding errors. is_happy() also does a creds check.
					{
						newview.set({
							view: $(this).data("show")
						});
					}
				}
				if ($(this).attr("data-clickaction")) //trigger action based on data-clickaction value, currently only used for logout
				{
					e.preventDefault();
					$(document).trigger($(this).data("clickaction"), [$(this)]);
				}
			}

			if ($(this).attr("data-eventname")) {
				analytics.logger({
					"event-name": $(this).data("eventname")
				});
			} //log click event if data-event attached
		});

		//change locale
		$(".footer-locale-select").on("change", function (e) {
			e.preventDefault();
			analytics.logger({
				"event-name": "locale-selected",
				"old-locale": url_param("locale"),
				"new_locale": $(this).val()
			}); //log before changing. necessary to do this here instead of newview because just having locale param in url does not always mean locale was toggled with dropdown
			newview.set({
				locale: $(this).val()
			});
		});

		//set store id to the dropdown
		$("select#a_empemail").on("change", function (e) {
			e.preventDefault();
			state.store_id = $(":selected", this).text();
			state.store_email = $(":selected", this).val();
			creds.track(); //set analytics cookie
			analytics.logger({
				"event-name": $(this).data("eventname")
			});
		});
		
		//INITIALIZE!
		newview.set(); //call newview without params to show default content only and hide the rest. newview also has a call to re-run translations.
	});
})();
