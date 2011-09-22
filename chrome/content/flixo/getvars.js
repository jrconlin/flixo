var Flixo_getVars = {
    // browser : Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser'),
    // flixo: this.browser.Flixo,


    init: function()
    {
        if (!this.browser)
            this.browser = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser');
        if (!this.flixo)
            this.flixo = this.browser.Flixo;
        this.fillOptions();
    },

    _onKeyUp: function (event)
    {
        this.flixo.log('event '+event.keyCode);
        if (event.keyCode == 13)
        {
            event.stopPropagation();
            this.submit();
        }
    },

    fillOptions: function()
    {
        if (!this.browser)
            this.browser = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser');
        this.flixo.log('fillingOptions');
        var unknown=this.flixo._getVars.unknown;
        var itemList = document.getElementById('items');
        for (i in unknown)
        {
            var elem=unknown[i];
            this.flixo.log('unknown '+elem);
            var row = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",'row');
            var label = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",'label');
            label.setAttribute('value',elem);
            label.setAttribute('control',elem);
            row.appendChild(label);
            var textbox = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",'textbox');
            textbox.setAttribute('id',elem.toLowerCase());
            textbox.setAttribute('value','');
            textbox.addEventListener('keyup',
                                    function(event) {
                                        Flixo_getVars._onKeyUp(event)},
                                    true);
            row.appendChild(textbox);
            itemList.appendChild(row);
        }
        itemList.getElementsByTagName('textbox')[0].focus();
        window.sizeToContent();
        return true;
    },

    submit: function()
    {
        var inputs = document.getElementsByTagName('textbox');
        var vars = this.flixo._getVars.known;
        for (var i in inputs)
        {
            if(inputs[i].value)
            {
                vars[inputs[i].id]= inputs[i].value;
            }
        }
        window.close();
        this.flixo.flixotize('',{known:vars});
        return true;
    }

}
