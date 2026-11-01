package com.recallmate.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(RecallMateFilesPlugin.class);
        super.onCreate(state);
        EdgeToEdge.enable(this);
    }
}
