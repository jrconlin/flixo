/* Copyright (c) 2006 YourNameHere
   See the file LICENSE.txt for licensing information. */

var FlixoLoginWindow = {
    init: function () {
        this.args = window.arguments[0];
        this.flixo  = this.args.flixo;
        this.browser = document.getElementById('netflix_login');
        this.browser.addEventListener('DOMContentLoaded',function (event){
            FlixoLoginWindow.flixo.log('FlixoLoginWindow');
            var doc = document.getElementById('netflix_login').contentWindow.document;
            var win = doc.getElementById('continue');
            //if (doc.contentType.toLocaleLowerCase() == 'application/xml')
            {
                try {
/*                    if (doc.firstChild.nodeName.toLocaleLowerCase() == 'status' &&
                        doc.firstChild.firstChild.nodeValue.toLocaleLowerCase() == 'success')
                    {
                        FlixoLoginWindow.args['status']=doc.firstChild.firstChild.nodeValue;
                        window.close();
                    }
*/
                    FlixoLoginWindow.flixo.log('FlixoLoginWindow url:'+doc.documentURI+' ['+FlixoLoginWindow.flixo.observer.lastResp.responseStatus+']');
                    if (doc.documentURI.match(/oauth\/login\?/i) &&
                        (FlixoLoginWindow.flixo.observer.lastResp.responseStatus == 200)
                        )
                    {
                        var metas  = doc.getElementsByTagName('meta');
                        for (var i=0;i<metas.length;i++){
                            var meta = metas[i];
                            FlixoLoginWindow.flixo.examineObj('FlixoLoginWindow meta:',meta);
                            if ((meta.id.toLowerCase()=="nf-login-status") &&
                                (meta.content.toLowerCase()== "success"))
                                {
                                    FlixoLoginWindow.flixo.log("FlixoLoginWindow meta success");
                                    FlixoLoginWindow.args['status']=meta.content;
                                    window.close();
                                }
                        }

                        //backup plan //REMOVE THIS ONCE THE META CODE IS IN PLACE!
                        FlixoLoginWindow.flixo.examineObj('title',doc.getElementsByTagName('title')[0]);
                        if (doc.getElementsByTagName('title')[0].text.toLowerCase() == "success")
                        {
                            FlixoLoginWindow.flixo.log("FlixoLoginWindow title success");
                            FlixoLoginWindow.args['status']='success';
                            window.close();
                        }

                    }
                }
                catch (e) {
                    FlixoLoginWindow.flixo.examineObj('login: exception',e);
                }
            }
        },false);
        this.browser.setAttribute('src',this.args.src);
        //window.sizeToContent();
    }
}
