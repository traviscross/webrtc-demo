window.GUI = {

  

  phoneCallButtonPressed : function() {
    var target = phone_dialed_number_screen.val();

    if (target) {
      phone_dialed_number_screen.val("");
      GUI.jssipCall(target);
    }
  },


  phoneChatButtonPressed : function() {
    var user, session,
      uri = phone_dialed_number_screen.val();

    if (uri) {
      uri = JsSIP.utils.normalizeUri(uri, MyPhone.configuration.domain);
      if (uri) {
        user = JsSIP.grammar.parse(uri, 'SIP_URI').user;
      } else {
        alert('Invalid target');
        return;
      }

      phone_dialed_number_screen.val("");
      session = GUI.getSession(uri);

      // If this is a new session create it without call.
      if (!session) {
        session = GUI.createSession(user, uri);
        GUI.setCallSessionStatus(session, "inactive");
      }

      $(session).find(".chat input").focus();
    }
  },


  /*
   * JsSIP.UA new_session event listener
   */
  new_session : function(e) {
    var
      request = e.data.request,
      call = e.data.session,
      uri = call.remote_identity,
      session = GUI.getSession(uri),
      display_name = (call.direction === 'incoming') ? request.s('from').user : JsSIP.grammar.parse(request.ruri, 'SIP_URI').user,
      status = (call.direction === 'incoming') ? "incoming" : "trying";

    // If the session exists with active call reject it.
    if (session && !$(session).find(".call").hasClass("inactive")) {
      call.terminate();
      return false;
    }

    // If this is a new session create it
    if (!session) {
      session = GUI.createSession(display_name, uri);
    }

    // Associate the JsSIP Session to the HTML div session
    session.call = call;
    GUI.setCallSessionStatus(session, status);
    $(session).find(".chat input").focus();

    // EVENT CALLBACK DEFINITION

    // Progress
    call.on('progress',function(e){
      if (e.data.originator === 'remote') {
        GUI.setCallSessionStatus(session, 'in-progress');
      }
    });

    // Started
    call.on('started',function(e){
      GUI.setCallSessionStatus(session, 'answered');
    });

    // Failed
    call.on('failed',function(e) {
      var
        cause = e.data.cause,
        response = e.data.response;

      if (e.data.originator === 'remote' && cause.match("SIP;cause=200", "i")) {
        cause = 'answered_elsewhere';
      }

      GUI.setCallSessionStatus(session, 'terminated', cause);
      soundPlayer.setAttribute("src", "sounds/outgoing-call-rejected.wav");
      soundPlayer.play();
      GUI.removeSession(session, 1500);
    });

    // Ended
    call.on('ended', function(e) {
      var cause = e.data.cause;

      GUI.setCallSessionStatus(session, "terminated", cause);
      GUI.removeSession(session, 1500);
    });
  },


  /*
   * JsSIP.UA new_message event listener
   */
  new_message : function(e) {
    var display_name, text,
      message = e.data.message,
      request = e.data.request,
      uri = message.remote_identity,
      session = GUI.getSession(uri);

    if (message.direction === 'incoming') {
      display_name = request.s('from').user;
      text = request.body;

      // If this is a new session create it with call status "inactive", and add the message.
      if (!session) {
        session = GUI.createSession(display_name, uri);
        GUI.setCallSessionStatus(session, "inactive");
      }

      GUI.addChatMessage(session, "peer", text);
      $(session).find(".chat input").focus();
    } else {
      display_name = request.ruri;
      message.on('failed', function(e){
        var response = e.data.response;
        GUI.addChatMessage(session, "error", response.status_code.toString() + " " + response.reason_phrase);
      });
    }
  },


  /*
   * Esta función debe ser llamada por jssip al recibir un MESSAGE
   * de tipo application/im-iscomposing+xml,
   * y debe pasar como parámetro el From URI (sip:user@domain) y otro
   * parámetro active que es:
   * - true: es un evento "iscomposing active"
   * - false: es un evento "iscomposing idle"
   */
  phoneIsComposingReceived : function(uri, active) {
    var session = GUI.getSession(uri);

    // If a session does not exist just ignore it.
    if (!session)
      return false;

    var chatting = $(session).find(".chat > .chatting");

    // If the session has no chat ignore it.
    if ($(chatting).hasClass("inactive"))
      return false;

    if (active)
      $(session).find(".chat .iscomposing").show();
    else
      $(session).find(".chat .iscomposing").hide();
  },


  /*
   * Busca en las sessions existentes si existe alguna con mismo peer URI. En ese
   * caso devuelve el objeto jQuery de dicha session. Si no, devuelve false.
   */
  getSession : function(uri) {
    var session_found = null;

    $("#sessions > .session").each(function(i, session) {
      if (uri == $(this).find(".peer > .uri").text()) {
        session_found = session;
        return false;
      }
    });

    if (session_found)
      return session_found;
    else
      return false;
  },


  createSession : function(display_name, uri) {
    var session_div = $('\
    <div class="session"> \
      <div class="close"></div> \
      <div class="container"> \
        <div class="peer"> \
          <span class="display-name">' + display_name + '</span> \
          <span>&lt;</span><span class="uri">' + uri + '</span><span>&gt;</span> \
        </div> \
        <div class="call inactive"> \
          <div class="button dial"></div> \
          <div class="button hangup"></div> \
          <!--<div class="button hold"></div> \
          <div class="button resume"></div>--> \
          <div class="call-status"></div> \
        </div> \
        <div class="chat"> \
          <div class="chatting inactive"></div> \
          <input class="inactive" type="text" name="chat-input" value="type to chat..."/> \
          <div class="iscomposing"></div> \
        </div> \
      </div> \
    </div> \
    ');

    $("#sessions").append(session_div);

    var session = $("#sessions .session").filter(":last");
    var call_status = $(session).find(".call");
    var close = $(session).find("> .close");
    var chat_input = $(session).find(".chat > input[type='text']");

    $(session).hover(function() {
      if ($(call_status).hasClass("inactive"))
        $(close).show();
    },
    function() {
      $(close).hide();
    });

    close.click(function() {
      GUI.removeSession(session, null, true);
    });

     chat_input.focus(function(e) {
      if ($(this).hasClass("inactive")) {
      $(this).val("");
      $(this).removeClass("inactive");
      }
    });

    chat_input.blur(function(e) {
      if ($(this).val() == "") {
        $(this).addClass("inactive");
        $(this).val("type to chat...");
      }
    });

    chat_input.keydown(function(e) {
      // Ignore TAB and ESC.
      if (e.which == 9 || e.which == 27) {
        return false;
      }
      // Enter pressed? so send chat.
      else if (e.which == 13 && $(this).val() != "") {
        var text = chat_input.val();
        GUI.addChatMessage(session, "me", text);
        chat_input.val("");
        GUI.jssipMessage(uri, text);
      }
      // Ignore Enter when empty input.
      else if (e.which == 13 && $(this).val() == "") {
        return false;
      }
      // NOTE is-composing stuff.
      // Ignore "windows" and ALT keys, DEL, mayusculas and 0 (que no sé qué es).
      else if (e.which == 18 || e.which == 91 || e.which == 46 || e.which == 16 || e.which == 0)
        return false;
      // If this is the first char in the input and the chatting session
      // is active, then send a iscomposing notification.
      else if (e.which != 8 && $(this).val() == "") {
        GUI.jssipIsComposing(uri, true);
      }
      // If this is a DELETE key and the input has been totally clean, then send "idle" isomposing.
      else if (e.which == 8 && $(this).val().match("^.$"))
        GUI.jssipIsComposing(uri, false);
    });

    $(session).fadeIn(100);

    // Return the jQuery object for the created session div.
    return session;
  },


  setCallSessionStatus : function(session, status, description) {
    var session = session;
    var uri = $(session).find(".peer > .uri").text();
    var call = $(session).find(".call");
    var status_text = $(session).find(".call-status");
    var button_dial = $(session).find(".button.dial");
    var button_hangup = $(session).find(".button.hangup");
      //var button_hold = $(session).find(".button.hold");
    var button_resume = $(session).find(".button.resume");

    // If the call is not inactive or terminated, then hide the
    // close button (without waiting for blur() in the session div).
    if (status != "inactive" && status != "terminated") {
      $(session).unbind("hover");
      $(session).find("> .close").hide();
    }

    // Unset all the functions assigned to buttons.
    button_dial.unbind("click");
    button_hangup.unbind("click");
      //button_hold.unbind("click");
      //button_resume.unbind("click");

    button_hangup.click(function() {
      GUI.setCallSessionStatus(session, "terminated", "terminated");
      session.call.terminate();
      GUI.removeSession(session, 500);
    });

    switch(status) {
      case "inactive":
        call.removeClass();
        call.addClass("call inactive");
        status_text.text("");

        button_dial.click(function() {
          GUI.jssipCall(uri);
        });
        break;

      case "trying":
        call.removeClass();
        call.addClass("call trying");
        status_text.text(description || "trying...");
        //soundPlayer.setAttribute("src", "sounds/outgoing-call2.ogg");
        //soundPlayer.play();

        // unhide HTML Video Elements
        $('#remoteView').attr('hidden', false);
        $('#selfView').attr('hidden', false);

        // Set background image
        $('#remoteView').attr('poster', "images/bg.png");
        break;

      case "in-progress":
        call.removeClass();
        call.addClass("call in-progress");
        status_text.text(description || "in progress...");
        break;

      case "answered":
        call.removeClass();
        call.addClass("call answered");
        status_text.text(description || "answered");
        break;

      case "terminated":
        call.removeClass();
        call.addClass("call terminated");
        status_text.text(description || "terminated");
        break;

      case "incoming":
        call.removeClass();
        call.addClass("call incoming");
        status_text.text("incoming call...");
        soundPlayer.setAttribute("src", "sounds/incoming-call2.ogg");
        soundPlayer.play();

        button_dial.click(function() {
          var selfView = document.getElementById('selfView');
          var remoteView = document.getElementById('remoteView');
          session.call.answer(selfView, remoteView);
        });

        // unhide HTML Video Elements
        $('#remoteView').attr('hidden', false);
        $('#selfView').attr('hidden', false);

        // Set background image
	$('#remoteView').attr('poster', "images/bg.png");
        break;

      default:
        alert("ERROR: setCallSessionStatus() called with unknown status '" + status + "'");
        break;
    }
  },


  removeSession : function(session, time, force) {
    var default_time = 500;
    var uri = $(session).find(".peer > .uri").text();
    var chat_input = $(session).find(".chat > input[type='text']");

    if (force || ($(session).find(".chat .chatting").hasClass("inactive") && (chat_input.hasClass("inactive") || chat_input.val() == ""))) {
      time = ( time ? time : default_time );
      $(session).fadeTo(time, 0.7, function() {
        $(session).slideUp(100, function() {
          $(session).remove();
        });
      });
      // Enviar "iscomposing idle" si estábamos escribiendo.
      if (! chat_input.hasClass("inactive") && chat_input.val() != "")
        GUI.jssipIsComposing(uri, false);
    }
    else {
      // Como existe una sesión de chat, no cerramos el div de sesión,
      // en su lugar esperamos un poco antes de ponerlo como "inactive".
      setTimeout('GUI.setDelayedCallSessionStatus("'+uri+'", "inactive")', 1000);
    }

    // hide HTML Video Elements
    $('#remoteView').attr('hidden', true);
    $('#selfView').attr('hidden', true);
  },


  setDelayedCallSessionStatus : function(uri, status, description, force) {
    var session = GUI.getSession(uri);
    if (session)
      GUI.setCallSessionStatus(session, status, description, force);
  },


  /*
   * Añade un mensaje en el chat de la sesión.
   * - session: el objeto jQuery de la sesión.
   * - who: "me" o "peer".
   * - text: el texto del mensaje.
   */
  addChatMessage : function(session, who, text) {
    var chatting = $(session).find(".chat > .chatting");
    $(chatting).removeClass("inactive");

    if (who != "error") {
      var who_text = ( who == "me" ? "me" : $(session).find(".peer > .display-name").text() );
      var message_div = $('<p class="' + who + '"><b>' + who_text + '</b>: ' + text + '</p>');
    }
    // ERROR sending the MESSAGE.
    else {
      var message_div = $('<p class="error"><i>message failed: ' + text + '</i>');
    }
    $(chatting).append(message_div);
    $(chatting).scrollTop(1e4);

    if (who == "peer") {
      soundPlayer.setAttribute("src", "sounds/incoming-chat.ogg");
      soundPlayer.play();
    }

    // Si se había recibido un iscomposing quitarlo (sólo si es message entrante!!!).
    if (who == "peer")
      $(session).find(".chat .iscomposing").hide();
  },


/*
   * Cambia el indicador de "Status". Debe llamarse con uno de estos valores:
   * - "connected"
   * - "registered"
   * - "disconnected"
   */
  setStatus : function(status) {
    $("#conn-status").removeClass();
    $("#conn-status").addClass(status);
    $("#conn-status > .value").text(status);

    register_checkbox.attr("disabled", false);
    if(status == "registered")
      register_checkbox.attr("checked", true);
    else
      register_checkbox.attr("checked", false);
  },


  jssipCall : function(target) {
      var views, selfView, remoteView, useAudio, useVideo;

      selfView = document.getElementById('selfView');
      remoteView = document.getElementById('remoteView');
      views = {selfView: selfView, remoteView: remoteView};
      useAudio = true;
      useVideo = false;

      if ($('#video').is(':checked')) {
	  useVideo = {
	      "mandatory": {
		  "minWidth": "1280",
		  "minHeight": "720"
		  //                "minFrameRate": "30"
	      }
	  }
      }

      try {
        MyPhone.call(target, useAudio, useVideo, null, views);
      } catch(e){
        console.log(e);
        return;
      }
  },


  jssipMessage : function(uri, text) {
    try {
      MyPhone.sendMessage(uri,text);
    } catch(e){
      console.log(e);
      return;
    }
  },

  jssipHUPALL : function() {
      MyPhone.hupall();
  },

  jssipDTMF : function(key) {
      var r = 0;

    try {
      r = MyPhone.sendDTMF("application/dtmf-relay", "Signal=" + key + "\r\n" + "Duration=200\r\n");
    } catch(e){
	console.log(e, MyPhone);
    }

      return r;
  },


  jssipIsComposing : function(uri, active) {
    //JsSIP.API.is_composing(uri, active);
    console.info('is compossing..')
  }

};
