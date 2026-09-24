import fs from 'node:fs';
import path from 'node:path';

const pkgDir = path.join('android','app','src','main','java','com','mutoe','taiwanstocklab');
fs.mkdirSync(pkgDir,{recursive:true});

const mainActivity = `package com.mutoe.taiwanstocklab;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ChatGPTLauncherPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`;

const plugin = `package com.mutoe.taiwanstocklab;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ChatGPTLauncher")
public class ChatGPTLauncherPlugin extends Plugin {
  private static final String CHATGPT_PACKAGE = "com.openai.chatgpt";

  @PluginMethod
  public void open(PluginCall call) {
    String text = call.getString("text", "");
    String title = call.getString("title", "台股研究室深度分析");

    Intent intent = new Intent(Intent.ACTION_SEND);
    intent.setType("text/plain");
    intent.setPackage(CHATGPT_PACKAGE);
    intent.putExtra(Intent.EXTRA_TEXT, text);
    intent.putExtra(Intent.EXTRA_SUBJECT, title);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

    try {
      getActivity().startActivity(intent);
      JSObject ret = new JSObject();
      ret.put("opened", true);
      call.resolve(ret);
    } catch (ActivityNotFoundException e) {
      JSObject ret = new JSObject();
      ret.put("opened", false);
      ret.put("reason", "CHATGPT_NOT_INSTALLED");
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("無法開啟 ChatGPT", e);
    }
  }
}
`;

fs.writeFileSync(path.join(pkgDir,'MainActivity.java'), mainActivity);
fs.writeFileSync(path.join(pkgDir,'ChatGPTLauncherPlugin.java'), plugin);
console.log('Patched Android project with direct ChatGPT launcher plugin.');
