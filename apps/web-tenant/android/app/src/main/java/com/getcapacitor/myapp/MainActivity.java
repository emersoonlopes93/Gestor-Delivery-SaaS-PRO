package com.getcapacitor.myapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.gestor.tenant.BluetoothPrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
