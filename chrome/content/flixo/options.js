/* Netflix API assistant Options
 * Author: jr conlin
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
 * This is the Options class that underlays the "Settings" display panel.
 *
 */

var FlixoOpts = {

    /** Get the browser element
    */
    browser :  Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser'),
    prefs:     Application.extensions.get('flixo@netflix.com').prefs,

    /** Initialize the object
    */
    init: function(args)
    {
        this.flixo = this.browser.Flixo;
        this.flixo.examineObj('init: prefs',this.prefs);
        this.accounts = this.flixo.getAccounts();
        var profileList = document.getElementById('profileList');
        document.getElementById('hostPatterns').value = this.prefs.getValue('hostPatterns',this.flixo.defaultHostPatterns);
        //fill out the fields.
        try{
            for (var i in this.accounts)
            {
                profileList.appendItem(this.accounts[i].name,i);
            }
        }
        catch(e)
        {
           this.flixo.log (e);
        }
        finally {
            var lastItem = profileList.appendItem('Create New Profile');
            lastItem.value=-1;
            lastItem.className='new';
        }
        //## removed option to display results in a new tab
        // var nt = this.flixo.preference('newtab') == 'true';
        // this.flixo.log('nt: '+nt+'...'+(nt === 'true')+' typeof: '+typeof(nt));
        // document.getElementById('newtab').checked = (this.flixo.preference('newtab') == 'true');
        window.sizeToContent();
        return true;
    },

    /** Parse a URI into token elements.
     *
     * Kinda strange that there isn't a built in function for this.
     */
    _parseArgs: function (uri)
    {
        var result = {};
        var elements = uri.split('?');
        result.target=elements[0];
        if (elements[1])
            result.args=this._tokenize(elements[1])
        return result;
    },

    /** Convert the URI arguments into a hash
     *
     */
    _tokenize: function(uriString) {
        var tokVals = uriString.split('&');
        var oauthInfo = {};
        for (var i=0;i<tokVals.length;i++)
        {
            var token=tokVals[i].split('=',2);
            oauthInfo[token[0]]=token[1];
        }
        return oauthInfo;
    },

    /** Fetch the OAUTH Info for this API Key/Shared secret pair.
     *
     * By default, this will record the info for the currently logged in user.
     * I'd suggest using a different profile if you want a different user.
     *
     * TODO: Add wait cursor to this.
     **/
    fetchOAuthInfo: function()
    {
        // sequence:
        //  http://api.netflix.com/oauth/request_token
        //      > oauth_token=...&oauth_token_secret=...&application_name=...
        //  https://api-user.netflix.com/oauth/login?oauth_token=...&oauth_token_secret=...&application_name=...
        //      > success
        //  https://api.netflix.com/oauth/access_token?oauth_token=...&oauth_token_secret=...
        //      > oauth_token=...&oauth_token_secret=...&user_id=...

        var consumerKey = document.getElementById('profile_consumer_key').value;
        var consumerSecret = document.getElementById('profile_shared_secret').value;
        if (!consumerKey || !consumerSecret)
        {
            alert ("Sorry, I need both Consumer Key and Consumer Secret to get the OAuth Info");
            return;
        }
        // Set the auth level silently to "consumer"
        this.buttonCmd();
        var prevAuthState = this.flixo.sendAuthLevel;
        this.flixo.sendAuthLevel=1;

        // Build the oauth request:
        var url = 'http://'+this.flixo.defaultRootHost+'/oauth/request_token';
        var req = new XMLHttpRequest();
        // yes, this is blocking. I want this modal.
        req.open('GET',url,false);
        req.send(null);
        if (req.statusText != 'OK')
        {
            this.flixo.examineObj('failed fetchOAuthInfo: req',req);
            alert("Sorry, an error prevented me from getting the OAuth info.");
            this.flixo.sendAuthLevel=prevAuthState;
            return;
        }
        var oauthInfo = this._tokenize(req.responseText);
        this.flixo.examineObj('fetchOauthInfo: oauthInfo',oauthInfo);
        document.getElementById('profile_oauth_appname').value=oauthInfo.application_name;
        var loginUrl = 'http://api-user.netflix.com/oauth/login?output=pox'+
            '&application_name='+oauthInfo.application_name+
            '&oauth_token='+oauthInfo.oauth_token+
            '&oauth_token_secret='+oauthInfo.oauth_token_secret;
        this.flixo.log('fetchOauthInfo: loginUrl:'+loginUrl);
        var loginArgs = {flixo:this.flixo, src:loginUrl, parent:FlixoOpts};
        this.loginWindow = window.openDialog('chrome://flixo/content/login.xul',
                                            '',
                                            'chrome,dialog,centerscreen,modal,resizable',
                                            loginArgs);
        this.flixo.log('fetchOauthInfo: after dialog');
        url = 'http://'+this.flixo.defaultRootHost+'/oauth/access_token?'+
            //'application_name='+oauthInfo.application_name+
            'oauth_token='+oauthInfo.oauth_token+
            '&oauth_token_secret='+oauthInfo.oauth_token_secret;
        ;
        this.flixo.log('fetchOauthInfo: Access url:'+url);
        req.open('GET',url,false);
        req.send(null);
        if (req.statusText != 'OK')
        {
            this.flixo.examineObj('fetchOAuthInfo: failed req',req);
            alert("Sorry, an error prevented me from getting the OAuth info.\n"+
                  "["+req.status+"] "+req.responseText);
            this.flixo.sendAuthLevel=prevAuthState;
            return;
        }

        this.flixo.log('fetchOauthInfo: Successful access token acquired! '+req.responseText);
        oauthInfo = this._tokenize(req.responseText);
        document.getElementById('profile_oauth_token').value=oauthInfo.oauth_token;
        document.getElementById('profile_oauth_secret').value=oauthInfo.oauth_token_secret;
        document.getElementById('profile_user_id').value=oauthInfo.user_id;
        //Autosave the profile
        this.flixo.sendAuthLevel=prevAuthState;
        this.buttonCmd();
    },

    /** Activate the Set Developer Key button
    */
    activateDevKey: function()
    {
        document.getElementById('setDevAccessKey').disabled=false;
        return true;
    },

    /** Record the host patterns to the preferences
     *
     */
    setHostPatterns: function()
    {
        this.prefs.setValue('hostPatterns',document.getElementById('hostPatterns').value);
    },

    /** Populate the profile display controls from the profile record
    */
    populateProfile: function(info)
    {
        var entries = document.getElementById('profileInfo').getElementsByClassName('profile_entry');
        for (var i=0; i<entries.length;i++)
        {
            entries[i].value='';
            entries[i].disabled=false;
        }
        for(var i in info)
        {
            var elem=document.getElementById('profile_'+i);
            if (elem)
                elem.value=info[i];
        }
        // Tweak the submit button to indicate what we're going to do
        var ctrl = document.getElementById('button_action')
        ctrl.label="Update Profile";
        ctrl.value='update';
        ctrl.disabled=false;
        document.getElementById('button_delete').disabled=false;
        // ctrl = document.getElementById('isEnabled')
        // ctrl.disabled=false;
        // ctrl.checked=info['state'];

    },

    /** Blank fields and prepare for a new record
    */
    prepareNewUserProfile: function()
    {
        // clear the old profile entries:
        var entries = document.getElementById('profileInfo').getElementsByClassName('profile_entry');
        for (var i=0; i<entries.length;i++)
        {
            entries[i].value='';
            entries[i].disabled=false;
        }

        var ctrl = document.getElementById('button_action');
        ctrl.label="Add New Profile";
        ctrl.value='add';
        ctrl.disabled=false;
        document.getElementById('button_delete').disabled=true;
       // ctrl = document.getElementById('isEnabled');
       // ctrl.disabled=false;
       // ctrl.checked=true;
    },

    /** Well, this is convoluted, but it works.
    */
    deleteProfile: function()
    {
        // Get the selected info
        var profList = document.getElementById('profileList');
        var selected = profList.selectedItem;
        if (!selected)
            return false;
        var selectedIndex = profList.getIndexOfItem(selected);
        //this.flixo.examineObj('deleteProfile: selected',selected);
        // Now, delete the branch from the user preferences
        this.flixo.log('Deleting extensions.flixo@netflix.com.accounts.'+selected.value);
        var prefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService);
        var res = prefs.getBranch('extensions.flixo@netflix.com.accounts.'+selected.value).deleteBranch('');
        prefs.savePrefFile(null);
        prefs.readUserPrefs(null);
        this.flixo.refreshAccounts();
        this.flixo.log('Delete result = '+res);
        // And update the profile list to show what it's probably showing anyway.
        profList.selectItem(profList.getItemAtIndex(selectedIndex+1));
        profList.removeItemAt(selectedIndex);
        return true;
    },

    /** Perform the button actions (Add or Update the current record)
    */
    buttonCmd: function ()
    {
        var button = document.getElementById('button_action');
        var accountName=document.getElementById('profileInfo').getElementsByClassName('profile_name')[0].value;
        this.flixo.log('button '+button.value);
        //* Gather ye data where ye may.
        //* NOTE: Update could be lossy if you don't have fields to match what data you're storing.
        var item = {};
        var fields = document.getElementById('profileInfo').getElementsByClassName('profile_entry');
        for (var i=0; i < fields.length; i++)
        {
            var name = fields[i].id.replace('profile_','');
            item[name]=fields[i].value;
        }
        // item['state']=document.getElementById('isEnabled').checked;
        this.flixo.examineObj('buttonCmd: item',item);
        //* if we're adding, force this to undef so it does add.
        if (button.value == 'add')
        {
            item.num=undefined;
        }
        item = this.flixo.writeAccount(item);
        // writeAccount can fail to set the active flag, so explicitly set that value here.
        this.flixo.setActiveAccount(item.num,item.name);
        //this.flixo.examineObj('buttonCmd: item',item);
        //* if we've added it, update the account list.
        if (item)
        {
            var profileList=document.getElementById('profileList');
            this.accounts[item.num]=item;
            switch(button.value)
            {
                case "add":
                    var newItem = profileList.insertItemAt(profileList.getRowCount()-1,accountName,item.num);
                    profileList.selectItem(newItem);
                    button.label="Update Profile";
                    button.value='update';
                    var listItem = profileList.getItemAtIndex(profileList.currentIndex);
                    listItem.label=accountName;
                    listItem.value = profileList.getRowCount()-1;
                    this.flixo.log('buttonCmd: setting profile num '+listItem.value);
                    document.getElementById('profile_num').value=listItem.value;
                    break;
                case "update":
                    this.flixo.log('buttonCmd: updating');
                    var listItem = profileList.getItemAtIndex(profileList.currentIndex);
                    listItem.label=accountName;
                    listItem.value=item.num;
                    break;
            }
        }
    },

    /** Turn a button active
    */
    activeButton: function (buttonId)
    {
        document.getElementById(buttonId).disabled=false;
    },

    /** Toggle the value for a given preference
    */
    togglePref: function(prefName)
    {
        var pref = (this.flixo.preference(prefName) == 'true');
        //this.flixo.log('Togging from '+pref+' to '+!pref);
        this.flixo.preference(prefName,!pref);
    },

    /** Handle selection from the Profile List
    */
    profileListSelect: function()
    {
        var listCommand=document.getElementById('profileList');
        var item = listCommand.currentItem;
        if (item.value == -1)
        {
            this.prepareNewUserProfile();
            return true;
        }
        // this.flixo.examineObj('item',item);
        var info = this.accounts[item.value];
        //this.flixo.examineObj('info',info);
        this.populateProfile(info);
        return true;
    }
}
