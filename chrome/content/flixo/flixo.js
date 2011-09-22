/** Netflix API assistant
 * author: jr conlin
 *
 * Copyright 2008 by Netflix, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.

 *
 * NOTES:
 * This is my first Mozilla extension and it definitely shows. There are things
 * I need to clean up: including:
 *  * Use the new Applications.extensions.get(*).prefs function
 *  * Clean up orphaned functions
 *  * Document.
 *
 * XML integration:
 * Unfortunatly, there's no easy way for me to intercept the RSS/ATOM
 * pretty print routines.
 * Ok, to be honest, the first problem is that unless you add 1024 blank
 * characters between the opening <?xml> and the first <feed> or <rss> tag,
 * you're going to get the "helpful" SmartLink display. The next problem is that
 * once you're into the RSS pretty print routine, there's no easy way to get
 * anything. Modifying the elements causes the Pretty Printer to abort,
 * mouse events don't report the elements they're above, and many an angry word
 * is said.
 *
 *
 */


/* The core of the FlixoObserver code was stolen pretty brazenly from firebug. I'll
  * note that the official docs aren't quite right about getting the
  * observerService. If you follow that advice, you do create a service, but it's
  * never called. This one associates your object with the main observer and
  * absolutely gets called.
  *
  * TODO: need to ensure that this stays a singleton. I've seen odd results that
  * look like it's being instantiated more than once. I should probably walk the
  * registered observer tree looking for instances of self.
 */
var FlixoObserver =
{
    // for singleton
    registered: false,
    observerService: Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces['nsIObserverService']),

    registerObserver: function()
    {
        if (FlixoObserver.registered)
            return;
//        try {
            this.observerService.addObserver(FlixoObserver,"http-on-modify-request",false);
            this.observerService.addObserver(FlixoObserver,"http-on-examine-response",false);
            this.observerService.addObserver(FlixoObserver,"quit-application-granted",false);
            this.observerService.addObserver(FlixoObserver,"quit-application-requested",false);
            this.observerService.addObserver(FlixoObserver,"quit-application",false);
            this.observerService.addObserver(FlixoObserver,"xul-window-destroyed",false);

            this.registered = true;
            Flixo.log('FlixoObserver registered');
//        }
/*        catch (err) {
            alert('FlixoObserver.registerObserver error '+err);
        }
*/
        this.flixo = Flixo;
        // hardcoded for now, need to pull these from the preferences.
        this.nsIHttpChannel=Components.interfaces.nsIHttpChannel;
        Flixo.log('FlixoObserver Loaded');
        return;
    },

    unregisterObserver: function()
    {
        if (!FlixoObserver.registered)
            return false;

        try {
            this.observerService.removeObserver(FlixoObserver,"http-on-modify-request")
            this.observerService.removeObserver(FlixoObserver,"http-on-examine-response")
        }
        catch(err) {
            alert('FlixoObserver.unregisterObserver error '+err);
        }
        return true;
    },

    observe: function (aSubject, aTopic, aData)
    {
        //this.flixo.log('Observing '+aTopic);
        try {
            switch(aTopic) {
                case 'http-on-modify-request':
                    aSubject = aSubject.QueryInterface(this.nsIHttpChannel);
                    this.onModifyRequest(aSubject,aData);
                    break;
                case 'xul-window-destroyed':
                    if (!document || document.getElementById('flixo-toolbar')==null)
                        this.unregisterObserver();
                    break;
                case 'http-on-examine-response':
                    this.flixo.log('FlixoObserver response'+aSubject.URI.asciiSpec);
                    this.lastResp = aSubject;
                    break;
            }
        }
        catch (err)
        {
            this.flixo.log('FlixoObserver.observe error '+err);
        }
    },

    onModifyRequest: function(aRequest,aData) {
        var uri = aRequest.URI.asciiSpec;
        var process=false;
        var patterns= this.flixo.getHostPatterns();
        var pLen = patterns.length;
        //this.flixo.examineObj('onModifyRequest: patterns',patterns);
        for (var i=0;i<pLen;i++)
        {
            pattern=patterns[i];
            if (pattern.test(aRequest.URI.asciiHost))
            {
                process=true;
                continue;
            }
        }
        if (!this.flixo.prefs.getValue('oauthInHeaders',false) &&
            /oauth_signature/i.test(uri))
        {
            this.flixo.log('FlixoObserver found sig')
            process=false;
        }
        if (uri.match('favicon.ico'))
        {
            process=false;
        }
        try
        {
            if (!this.flixo.prefs.getValue('oauthInHeaders',false) &&
                aRequest.getRequestHeader('Authorization'))
            {
                if (uri.match(/oauth_token_secret/))
                    uri = uri.replace(/&?oauth_token_secret=[^&]+/,'');
                this.flixo.log('found auth header')
                process=false;
            }
        }
        catch(e) {
            // if getRequestHeader doesn't find the header, it throws an exception.
            }
        if (process)
        {
            //remember, posts need to be handled differently.
            this.flixo.log('FlixoObserver: processing '+aRequest.URI.asciiSpec);
            var oauthArgs = this.flixo.signUrl(aRequest.URI.asciiSpec);
            //hack to remove the secret from the uri.
            uri = uri.replace(/&?oauth_token_secret=[^&]+/,'');
            var argList = {};
            var pLen = oauthArgs.parameters.length;
            for (var i=0;i<pLen;i++)
            {
                if ((oauthArgs.parameters[i][0].substring(0,6) == 'oauth_') &&
                    (oauthArgs.parameters[i][0] != 'oauth_token_secret'))
                {
                    argList[oauthArgs.parameters[i][0]] = oauthArgs.parameters[i][1];
                    uri = uri.replace(RegExp('&?'+oauthArgs.parameters[i][0]+'=[^&]+'),'')
                }
            }
            if (pLen)
            {
                var argString = '';
                // if not in the headers, add them to the URI
                if (!this.flixo.prefs.getValue('oauthInHeaders',false))
                {
                    var joint='?';
                    if (aRequest.URI.asciiSpec.indexOf('?') > 1)
                        joint='&';
                    for (var i in argList) {
                        if (i.toLocaleLowerCase() != 'oauth_token_secret')
                        {
                            if (argString.length)
                                argString += '&';
                            argString += i + '=' + argList[i];
                        }
                    }
                    // Modifying the spec causes the URI to be reparsed.
                    this.flixo.log('FlixoObserver modify new spec:'+aRequest.URI.spec);
                    uri = uri+joint+argString;
                    // trap because mashery pukes if it sees this.
                    uri = uri.replace(/\?\&/,'?');
                    aRequest.URI.spec = uri;
                    this.flixo.log('FlixoObserver new URL: '+uri)
                } else {
                    for (var i in argList) {
                        if (argString.length)
                            argString += ', ';
                        argString += i + '="' + argList[i] + '"';
                    }
                    // Add the values to the auth headers.
                    aRequest.setRequestHeader('Authorization', 'OAuth ' + argString,false);
                    // Older auth header (should be deprecated)
                    // aRequest.setRequestHeader('WWW-Authenticate', 'OAuth ' + argString,false);
                }
            }
        }
    },

    QueryInterface: function(iid)
    {
        Flixo.log('interface queried '+iid);
        if (iid.equals(nsISupports) ||
            iid.equals(nsIObserver))
        {
            return this;
        }
        throw Components.results.NS_NOINTERFACE;
    }

}

var Flixo =
{
    /* TODO:
     * Check for memory leak
     */

    /** Enable Debugging output to the javascript console
    */
    viewAs:'json',
    sendAuthLevel:1,
    browser: getBrowser(),
    observer: FlixoObserver,
    defaultHostPatterns: 'api.netflix.com,netflix.api.mashery.com,localhost,api-user.netflix.com',
    defaultRootHost: 'netflix.api.mashery.com',
    console: Application.console,
    prefs: Application.extensions.get('flixo@netflix.com').prefs,

    /** Do setup
    */
    init: function(parent)
    {
        //this.statusBox = document.getElementById('flixo-status');
        //alert(this.statusBox.tagName);
        //this.statusBox.addEventListener('click',function(event){ this.pageRefreshed(event); },false);
        var sProf = new Date;

        // ** this.console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
        this.DEBUG = this.prefs.getValue('debug',false);
        this.upgrade();
        // Calling stringbundle is causing the ext not to load.
        //this.strings = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundle);
        this.browser = getBrowser();
        gBrowser.Flixo = this;
        this.viewAs = 'pox';
        this.contentWindow = this.browser.contentWindow;
        window.addEventListener('DOMContentLoaded',function (event) {
            gBrowser.Flixo.pageRefreshed(event); } ,false);
        var menu = document.getElementById("contentAreaContextMenu");
        menu.addEventListener("popupshowing", this.contextPopupShowing, false);
        this.log("Registering Observer");
        FlixoObserver.registerObserver();
        this.updateToolbar();
        this.log('loaded '+((new Date - sProf)/1000));
        return this;
    },

    upgrade: function()
    {
        try {
            var _oldPrefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('flixo.')
            var info = {};
            var children = _oldPrefs.getChildList("",info);
            var childLen = children.length;
            this.examineObj('upgrade: children',children);
            for(var i=0;i<childLen;i++)
            {
                var prefVal;
                var keyName = children[i];
                this.log("upgrade: keyname "+keyName);
                var prefType = _oldPrefs.getPrefType(keyName);
                switch (prefType)
                {
                    case _oldPrefs.PREF_STRING:
                        prefVal = _oldPrefs.getCharPref(keyName);
                        break;
                    case _oldPrefs.PREF_INT:
                        prefVal = _oldPrefs.getIntPref(keyName);
                        break;
                    case _oldPrefs.PREF_BOOL:
                        prefVal = _oldPrefs.getBoolPref(keyName);
                        break;
                }
                this.log("upgrade: prefVal="+prefVal);
                this.prefs.setValue(keyName,prefVal);
                _oldPrefs.deleteBranch(keyName);
            }

        }
        catch(e)
        {
            this.examineObj('upgrade exception',e);
        }
    },

    /* get/set preference value
     * This uses the older method of getting/setting preferences and should be
     * replaced with the new Application.extenstions.get(*).preference stuff
     *
    */
    preference: function(key,value) {
        alert('OLD CALL');
        return undefined;
    },

    refreshAccounts: function() {
        delete this._accounts;
        var accnts = this.getAccounts();
        // if the current profile no longer exists, grab the first one and make it so.
        if (!accnts[this.activeAccount])
        {
            for (var i in accnts) {
                if (accnts[i]){
                    this.setActiveAccount(i,accnts[i].name);
                    return;
                }
            }
        }
    },


    /** Fetch the account info from the mozilla preferences section
    */
    getAccounts: function()
    {
        var sInit = new Date;
        this.log('getAccounts start: '+sInit);
        if (!this._accounts)
        {
            this._accounts=new Array;
            var allPrefs = this.prefs.all;
            var pLen = allPrefs.length;
            for (var i=0; i<pLen; i++) {
        //        this.log('getAccounts: '+allPrefs[i].name);
                if (allPrefs[i].name.match(/^accounts/)) {
                    var elements = allPrefs[i].name.split('.');
                    if (!this._accounts[elements[1]]) {
                        this._accounts[elements[1]] = {'num':elements[1]};
                    }
                    this._accounts[elements[1]][elements[2]]=allPrefs[i].value;
                }
            }
            //this._accounts = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('extensions.flixo@netflix.com.accounts');
        }
        for (var i in this._accounts)
        {
            if ((this._accounts[i]) && (this._accounts[i].state == 1)){
                this.activeAccount = i;
                this.activeAccountName = this._accounts[i].name;
            }
        }
        this.log('getAccounts stop: '+(new Date - sInit)/1000);
        return this._accounts;
    },

    getHostPatterns: function ()
    {
        var rawPatterns = this.prefs.getValue('hostPatterns',this.defaultHostPatterns).split(/\s*,\s*/)
        var patterns=[];
        for (var i=0;i<rawPatterns.length;i++)
        {
            patterns.push(new RegExp(rawPatterns[i],'i'));
        }
        return patterns;
    },

    /** Create a hash of objects that contain the preferences
    */
    getPrefVals: function (branch)
    {
        var keys = branch.getChildList("",{});
        var pLen = keys.length;
        var elements = {};
        for (var i=0;i<pLen;i++)
        {
            var val;
            var key = keys[i];
            //this.log('key: '+key+' -- '+i);
            switch(branch.getPrefType(key)){
                case branch.PREF_STRING:
                    val=branch.getCharPref(key);
                    break;
                case branch.PREF_INT:
                    val=branch.getIntPref(key);
                    break;
                case branch.PREF_BOOL:
                    val=branch.getBoolPref(key);
                    break;
            }
            var bits=key.split('.',2);
            if (!elements[bits[0]])
            {
                elements[bits[0]]={num:bits[0]};
            }
            elements[bits[0]][bits[1]]=val;
        }
        return elements;
    },

    /** Write account info to preferences
    */
    writeAccount: function(account)
    {
        var taboo = ['num','length']
        this.log('Setting account');
        this.examineObj('writeAccount: account',account);
        var num;
        if (account.num)
        {
            num=account.num;
        }
        else
        {
            num=parseInt(this.prefs.getValue('maxAccount',0));
            if (!num)
            {
                num=0;
            }
            num=num+1;
            this.prefs.setValue('maxAccount',num);
        }
        for(i in account)
        {
            // if i is a taboo word
            this.log('checking '+i);
            if (-1 != taboo.indexOf(i))
            {
                this.log(i+' is taboo!');
                continue;
            }
            if (account[i] == undefined)
            {
                this.log(i+' is undefined');
                continue;
            }
            this.log('setting '+num+'.'+i+' = '+account[i]);
            // ideally, check the type we're about to write.
            try {
                this.prefs.setValue('accounts.'+num+'.'+i,account[i]);
            }
            catch (e) {
                this.log('Could not set value "' +
                         account[i]+'" for key "'+num+'.'+i+'"');
                this.log(e);
                return false;
            }
        }
        this.setActiveAccount(num,account.name);
        this.refreshAccounts();
        return account;
    },

    /** Set more than one account info to preferences
    */
    writeAccounts: function (accountArray)
    {
        var result = true;
        for (var i=0;i<accountArray.length;i++)
        {
            result = result && this.writeAccount(accountArray[i]);
        }
        return result;
    },

    /** Return substitution values from the active account
    */
    values: function ()
    {
        // get the accounts and also set the activeAcccount
        var accounts = this.getAccounts();
        if (this.activeAccount == undefined)
            return false;
        this.log('values: activeAccount: '+this.activeAccount);
        var vals = accounts[this.activeAccount];
        this.examineObj('values: vals',vals)
        vals['view']=this.viewAs;
        try
        {
            var child = document.getElementById('flixo-expand-list').firstChild;
            var expandList = [];
            while (child)
            {
                if (child.checked)
                    expandList.push(child.value);
                child=child.nextSibling;
            }
            if (expandList.length)
                vals['expand']=expandList.join(',');
        }
        catch (e)
        {}
        return vals;
    },

    /** Could they make this any harder?
    */
    asInputStream: function(str)
    {
        var inputStream = Components.classes["@mozilla.org/io/string-input-stream;1"]
                  .createInstance(Components.interfaces.nsIStringInputStream);
        inputStream.setData(str,str.length);
        return inputStream;
    },

    /** Sign the URL with the appropriate OAuth info
    */
    signUrl: function (link,oauthArgs,postArgs)
    {
        this.log('signUrl signing :'+link+' '+link.indexOf('?'));
        var message = {
            action: link,
            parameters: []
        };
        var i;
        var accessor={};
        var args = {};
        // Get the "active profile values"
        var user = this.values();

        if (!oauthArgs)
            oauthArgs={};
        //Parse the URI
        if (link.indexOf('?') > 0)
        {
            var t = link.split('?',2);
            var argList = t[1].split('&');
            for (i=0;i<argList.length;i++)
            {
                var kv=argList[i].split('=');
                args[kv[0]]=unescape(kv[1]);
            }
            this.examineObj('signUrl: args',args);
        }
        // Store the token for auth level later
        if (args.oauth_token)
            oauthArgs.token=args.oauth_token;
        if (args.oauth_token_secret)
        {
            oauthArgs.secret = args.oauth_token_secret;
            accessor.tokenSecret = args.oauth_token_secret;
            delete args.oauth_token_secret;
        }
        else if ((this.sendAuthLevel > 1) && user.oauth_secret)
        {
            accessor.tokenSecret = user.oauth_secret;
        }

//        if (/\/user\//.test(link))
//            sendOAuth=true;
        this.examineObj('signUrl: user',user);
        // if we are to send any auth info, set the consumer secret.
        if(this.sendAuthLevel > 0)
            accessor.consumerSecret = user.shared_secret;
        if (!oauthArgs.token && user.oauth_token)
        {
            oauthArgs.token=user.oauth_token;
            oauthArgs.secret=user.oauth_secret;
        }
        if (accessor.tokenSecret && !accessor.tokenSecret.length)
            accessor.tokenSecret = undefined;
        if (postArgs)
        {
            message.method='POST';
            for (i=0;i<postArgs.length;i++)
            {
                var postBits = postArgs[i].split('=',2);
                message.parameters.push(postBits);
            }
        }
        else
        {
            message.method='GET';
            var getBits=link.split('?',2);
            if (getBits[1])
            {
                message.action=getBits[0];
                for (i in args)
                {
                    if (args[i])
                        message.parameters.push([i,args[i]]);
                }
            }
        }
        // No signature asked for, none given.
        if (this.sendAuthLevel ==0 )
            return message;
        this.examineObj('signUrl: accessor',accessor);
        if (args.oauth_token)
            OAuth.setParameter(message,'oauth_token',args.oauth_token)
        else if (accessor.tokenSecret && oauthArgs.token)
            OAuth.setParameter(message,'oauth_token',oauthArgs.token);
        if (accessor.consumerSecret)
        {
            if (user.consumer_key)
                OAuth.setParameter(message,'oauth_consumer_key',user.consumer_key);
        }
        if (this.prefs.getValue('oauth_plaintext',false))
            OAuth.setParameter(message,'oauth_signature_method','PLAINTEXT');
        OAuth.setTimestampAndNonce(message);
        //OAuth.setParameter(message,'oauth_nonce','123456');
        //OAuth.setParameter(message,'oauth_timestamp','1220580472')
        this.log('Attempting to sign '+message.action);
        OAuth.SignatureMethod.sign(message,accessor);
        //OAuth.setParameter(message,'oauth_signature',escape(OAuth.getParameter(message,'oauth_signature')));
        this.examineObj('signUrl: message',message);
        return message;
     },

    /** Open the link according to user preferences
     * using the post args and headers.
    */
    openLink: function (link,postArgs)
    {
        var oauthInHeaders=this.prefs.getValue('oauthInHeaders',false);
        var postArg=null;
        var refererArg=null;
        var oauthArgs={parameters:[]};

        if (link == undefined)
            return false;
        if (link.match(/\/oauth/i))
            link=link.replace(/\?.*/,'');
        this.log('open link: '+link);
        if (postArgs && postArgs.length)
            postArg=this.asInputStream(postArgs.join("\r\n")+"\r\n");
        this.log('Open link: '+link);
        // Signing now done in Observer
        if (this.prefs.getValue('newtab',false)== 'true')
        {
            var newTab = gBrowser.addTab();
            //link, flags, refererArg, postArg, headerArg
            newTab.webNavigation.loadURI(link,
                nsIWebNavigation.LOAD_FLAGS_NONE,refererArg,postArg,undefined);
        }
        else
        {
            if (!oauthInHeaders)
            {
                var joint='?';
                if (link.match(/\?/))
                    joint='&'
                gBrowser.selectedBrowser.webNavigation.loadURI(link,
                    nsIWebNavigation.LOAD_FLAGS_NONE,refererArg,postArg,undefined);
            }
            else
            {
                gBrowser.selectedBrowser.webNavigation.loadURI(link,
                    nsIWebNavigation.LOAD_FLAGS_NONE,refererArg,postArg,undefined);
            }
            //gBrowser.contentWindow.document.location=link;
        }
        return true;
    },

    parseToken: function(token)
    {
        // For now, take a pretty simplistic method to get tokens
        this.log ('parseToken '+token);
        var results = {};
        if (token.match(/^\-join/i))
        {
            this.log('command');
            results.type='command';
            var subTokens = token.split('|');
            results.command=subTokens.shift();
            results.arg = subTokens.shift();
            //also handle "," because I'm an idiot
            if (subTokens.length==1 && subTokens[0].match(/,/))
                subTokens=subTokens[0].split(',');
            results.elements=subTokens;
        }
        else
        {
            results.type='var';
            results.elements=[token.toLocaleLowerCase()];
        }
        return results;
    },

    /** get the variables within the provided content
    */
    getVars: function(content)
    {
        var vars ={unknown:{},known:{}};
        var values = this.values();
        for (var i in this.searchTokens)
        {
            var token = this.searchTokens[i];
            var matches = token.exec(content);
            while (matches)
            {
                var key = this.parseToken(matches[1]);
                for (var j=0;j<key.elements.length;j++)
                {
                    var lkey = key.elements[j].toLocaleLowerCase();
                    if (!values[lkey])
                        vars['unknown'][lkey]=key.elements[j];
                    else
                        vars['known'][lkey]=values[lkey];
                }
                matches = token.exec(content);
            }
        }
        return vars;
    },

    /** Ask the user for the unknown variables
    */
    queryVars: function(vars)
    {
        this._getVars = vars;
        this._getVarsWindow = window.openDialog('chrome://flixo/content/getvars.xul',
            '',
            'centerscreen,chrome,resizable=yes,scrolbars=yes');
        return true;
    },

    updateToolbar: function()
    {
        if (this.prefs.getValue('showOutput',false))
            document.getElementById('flixo-view').style.display='';
        else
            document.getElementById('flixo-view').style.display='none';
        if (!this.activeAccountName && this.getAccounts()[this.activeAccount])
            this.activeAccountName = this.getAccounts()[this.activeAccount].name;
        if (!this.sendAuthLevelName)
            this.sendAuthLevelName = 'Send Consumer Authorization';
        if (!this.viewAsName)
            this.viewAsName = 'POX (Plain ol\' XML)';
        if (this.activeAccountName)
            document.getElementById('flixo-accounts').label = 'Profile:'+this.activeAccountName;
        if (this.sendAuthLevelName)
            document.getElementById('flixo-sendAuth').label = this.sendAuthLevelName;
        if (this.viewAsName)
            document.getElementById('flixo-view').label = 'View:'+this.viewAsName;

    },

    /** Replace variables in the selected text and open it.
    */
    flixotize: function(content,vars)
    {
        if (!content || !content.length)
        {
            var selection = getBrowserSelection();
            if (selection.length)
            {
                // trim the string
                selection = selection.replace(/^\s+/,'').replace(/\s$/,'');
            }
            if (!selection.length)
                return false;
            content = selection;
        }
        if (!vars)
        {
            vars = this.getVars(content);

            if (!this.isEmpty(vars.unknown))         // __count__ is a magic property
            {
                return this.queryVars(vars);
            }
        }
        this.examineObj('flixotize: vars',vars.known);
        this.openLink(this.asLink(content,vars.known));
        return true;
    },

    /** Display the link in the context menu depending on if there's content selected
    */
    contextPopupShowing: function(context)
    {
        var menu = document.getElementById('flixo-content-flixotize');
        if (gContextMenu.isTextSelected)
        {
            // getBrowserSelection "helpfully" trims to 150 characters.
            // use document.commandDispatcher.focusedWindow.getSelection().toString();
            // for longer chunks.
            var selection = getBrowserSelection();
            // trim the string
            selection = selection.replace(/^\s+/,'').replace(/\s$/,'');
            selection = selection.replace(/<[^>]+>/,'');
            var hint = selection.substring(0,20);
            if (selection.length > hint.length)
                hint = hint+'...';
            menu.hidden=false;
            menu.label='Flixotize "'+hint+'"';
            this.toFlixotize=selection;
            document.getElementById('flixo-content-flixotizeEdit').hidden=true;
        }
        else
        {
            menu.hidden=true;
            document.getElementById('flixo-content-flixotizeEdit').hidden=true;
        }
        return true;
    },

    /** Show the user configuration options
    */
    showOptions: function()
    {
        this.optWindow = window.openDialog('chrome://flixo/content/options.xul',
                                           'Flixo Options',
                                           'chrome,centerscreen,resizable=yes,scrollbars=yes',this);
        return true;
    },

    /** Semi generic button handler
    */
    doButton: function (select)
    {
        switch(select.id)
        {
            case 'flixo-settings':
                this.optWindow = Flixo.showOptions();
                break;

        }
      this.log('doButton: '+select.id);
    },

    /** Helper to create a new NameSpaced menu item.
    */
    createMenuItem: function(attrs)
    {
        var xulElement = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menuitem");
        for(var i in attrs)
        {
            xulElement.setAttribute(i,attrs[i]);
        }
        return xulElement;
    },

    /** Clear all menu items from a list
    */
    clearMenuItems: function(parent)
    {
        while(parent.firstChild)
            parent.removeChild(parent.firstChild);
    },

    /** populate the account list (with checkmark next to active listing)
    */
    populateAccounts: function (event)
    {
        select = document.getElementById('flixo-accounts-list');
        var accounts = this.getAccounts();
        for (var i in accounts)
        {
            var element = this.createMenuItem({label:(accounts[i].name),
                                              value:(accounts[i].num),
                                              type:"radio",
                                              oncommand: "Flixo.setActiveAccount(this.value,this.label);",
                                              checked:(accounts[i].state == "1")});
            select.appendChild(element);
        }
        return true;
    },

    populateExpands: function (event)
    {
        var location = gBrowser.contentWindow.document.location.pathname;
        if (location.indexOf("/catalog/people")>-1)
            document.getElementById('flixo-expand-filmography').disabled=false;
        else
            document.getElementById('flixo-expand-filmography').disabled=true;

    },

    /** Set the active account ID
    */
    setActiveAccount: function(accountNum,accountName)
    {
        if (!accountNum)
        {
            this.log('undefined account number');
            return false;
        }
        if (!this._accounts[accountNum])
        {
            this.log('invalid account number');
            return false;
        }
        this.log('setActiveAccount '+accountNum+' '+accountName);
        var prevActive = this.activeAccount;
        if (prevActive != undefined && this._accounts[prevActive])
        {
            this.prefs.setValue('accounts.'+prevActive+'.state','0');
            this._accounts[prevActive]['state']=0;
        }
        this.activeAccount=accountNum;
        if (accountName)
            this.activeAccountName = accountName;
        else
            this.activeAccountName = this._accounts[accountNum].name;
        if (accountNum)
        {
            this.updateToolbar();
            this.prefs.setValue('accounts.'+accountNum+'.state','1');
            this._accounts[accountNum]['state']=1;
        }
        //this.examineObj(this.browser);
        this.browser.reload();
        return true;
    },

    setAuthLevel: function(element)
    {
        this.log("Setting auth level to "+element.value);
        this.sendAuthLevel=element.value;
        this.sendAuthLevelName=element.label;
        this.updateToolbar();
    },

    /** Helper to clear the Active Accounts list
    */
    clearAccounts: function(event)
    {
        this.clearMenuItems(document.getElementById('flixo-accounts-list'));
        return true;
    },

    /** Generic "open menu" function.
    */
    openMenu: function (select)
    {
        this.log('openMenu: '+select.id);
        return true;
    },

    /** Set the view
    */
    setView: function (event)
    {
      this.viewAs = event.value;
      this.viewAsName = event.label;
      this.log('setView: '+this.viewAs);
      var location=''+gBrowser.contentWindow.document.location;
      location = location.replace(/&?oauth_[^&]+/g,'').replace(/&output=[^&]+/,'');
      if (location.match(/\?/))
        location += '&'
      else
        location += '?';
      location += 'output='+this.viewAs;
      this.log('setView: '+location);
      gBrowser.contentWindow.document.location=location;
      this.updateToolbar();
    },

    jumpTo: function (event)
    {
        return gBrowser.contentWindow.document.location=event.value;
    },

    toggleValue: function(event)
    {
        return true;
    },


    /** Helper to set the Expand menu item (causes reload)
    */
    setExpand: function (event)
    {
        this.log('setExpand: '+event);
        var expands =  this.getExpands();
        // force to string so that we can use the replace method.
        var location = ''+gBrowser.contentWindow.document.location;
        this.log(' location: '+location);
        location = location.replace(/&?oauth_[^&]+/g,'').replace(/&?expand=[^&]+/i,'');
        if (expands.length)
        {
            if (!location.match(/\?/))
                location = location+'?';
            location = location +'&expand='+this.getExpands().join(',').replace(/\?\&/,'?');
        }
        return this.openLink(location);
    },

    getExpands: function ()
    {
        var results = [];
        var expands = document.getElementById('flixo-expand-list').getElementsByTagName('menuitem');
        for (var i=0; i<expands.length; i++)
        {
            try {
                this.log('expands '+expands[i].getAttribute('checked')+' '+expands[i].value);
                if ((!expands[i].disabed) && expands[i].getAttribute('checked'))
                {
                    results.push(OAuth.percentEncode(expands[i].value))
                }
            }
            catch (e)
            {
                this.log(e);
            }
        }
    return results;
    },

    /** Scan and replace tokens in urls with values from active account
    */
    asLink: function(content,vars)
    {
        this.log("Linking "+content);
        if (!vars)
            vars={};

        var values = this.values();
        for (var i in this.searchTokens)
        {
            var token = this.searchTokens[i];
            var matches = token.exec(content);
            while(matches)
            {
                var replacement='';
                var key = this.parseToken(matches[1]);
                this.examineObj('asLink: key',key);
                switch (key.type)
                {
                    case 'command':
                    {
                        var replacements = [];
                        for (var j=0; j < key.elements.length;j++)
                        {
                            if (vars[key.elements[j]])
                            {
                                replacements.push(OAuth.percentEncode(key.elements[j]) + '='
                                            + OAuth.percentEncode(vars[key.elements[j]]));
                            }
                        }
                        replacement = replacements.join(key.arg);
                        this.log('command replacement: '+replacement);
                    }
                    break;

                    case 'var':
                    default:
                        this.examineObj('asLink: vars',vars);
                        replacement=vars[key.elements[0]];
                        break;
                }
                if (!replacement)
                    replacement='';
                this.log('replacement: '+replacement+' length:'+replacement.length);
                if (replacement && replacement.length)
                {
                    content=content.replace(matches[0],replacement)
                    this.log('replaced '+matches[0]+' with '+replacement+' '+content);
                }
                else
                {
                    content=content.replace(matches[0],'');
                }
                matches=token.exec(content);
            }
        }

        // Add the url options
        if (!content.match(/\?/))
            content = content+'?';
        if (!content.match(/output=/i))
            content = content+'&output='+this.viewAs;
        else
            content=content.replace(/output=(\w+)/i,'output='+this.viewAs);
        var expands = this.getExpands().join(',')
        if (expands.length)
            if (!content.match(/expand=/i))
                content = content+'&expand='+expands;
            else
                content = content.replace(/expand=([\w,]+)/i,'expand='+expands);
        //purge remaining bits.
        content=content.replace(/{\w+}/g,'').replace(/\?\&/,'?');
        this.log('asLink: '+content);
        return content;
    },

    /** Process the tokenized elements on the page.
    */
    processElements: function (elements)
    {
        var len = elements.length;
        for (var i=0;i<len;i++)
        {
            var elem = elements[i];
            //TODO: Avoid page reload?
            var fixLink = this.asLink(elem.textContent);
            elements[i].innerHTML = '<a href="'+fixLink+'">'+elem.innerHTML+'</a>';
        }
    },

    /** The patterns for replacable text tokens.
    */
    searchTokens: [
                   /{([^}]+)}/g,
                   ],

    /** On pageRefresh event
    */
    pageRefreshed: function(event)
    {
        var browser = getBrowser();
        var win = getBrowser().contentWindow;
        var doc = getBrowser().contentWindow.document;
        // /<([^>]+)>/g,
        var elements;
        //if (!(doc.documentURI.match('^file:') || doc.documentURI.match('netflix.com')))
        //    return true;
       // "this" is set to the ChromeWindow, not this object.
        window.lastClicked=this;
        window.lastEvent=event;
        // dumpObj('win.contentWindow',gBrowser.contentWindow);
        elements = doc.getElementsByClassName('flixo_link');
        // dumpObj('elements',elements)
        this.processElements(elements);
        this.log('content refreshed '+event.originalTarget.location);
        return true;
    },


    // DEBUGGING AND DIAGNOSTICS

    /** Print a message to the error log
    */
    log: function(msg)
    {
        if (this.prefs.getValue('debug',false) == false)
            return true;
      //this.console.logStringMessage(msg);
      this.console.log(msg);
      return true;
    },

    isEmpty: function (obj)
    {
        this.log(typeof(obj));
        if (obj == undefined)
            return true;
        switch (typeof(obj))
        {
            case 'object':
                for (var i in obj)
                {
                    return false;
                }
                return true;
            default:
                return (obj.length==0);
        }
    },

    /** Dump the object to the Javascript Console
    */
    examineObj: function (label,object)
    {
        if (this.prefs.getValue('debug',false) == false)
            return true;
        if (label && (object == undefined))
        {
            object = label;
            label = 'object';
        }
        for (var i in object)
        {
            var e = object[i];
            var str = label+'.'+i+' = ';
            switch(typeof(e))
            {
                case 'string':
                    str = str + ( ''+e.substring(0,200) );
                    break;
                case 'boolean':
                case 'number':
                    str = str + e;
                    break;
                case 'function':
                    str = str + ' function()';
                    break;
                case 'object':
                    try {
                    str = str + ' ' + e;
                    }
                    catch (e)
                    {
                        this.log(str+' Error '+e);
                    }
                    if (i == 'childNodes')
                    {
                            for (ij in e[1])
                                gBrowser.Flixo.log(label+'.childNodes:: '+ij);
                    }
                    /*if ( e.length )
                        str = str + ' length '+e.length;
                    */
                    break;
                default:
                    str = str + ' ' + typeof(e);
            }
            this.log(str);
        }
        return true;
    },

    /** Examine a given event
    */
    examineEvent: function(event)
    {
        if (this.prefs.getValue('debug',false) == false)
            return true;
        this.log('event('+event.type+'): '+event.target.tagName+', '+event.target.localName);
        // fake call these to instatiate the DOM for them.
        event.target.textContent;
        event.target.childNodes;
        this.log(event.target);
        this.examineObj('event.target',event.target);
        return true;
    }
}

if (!gBrowser.Flixo)
    window.addEventListener('load',function(event){ Flixo.init(event); },false);
