package com.gestor.tenant;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    private static final String TAG = "BluetoothPrinter";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket bluetoothSocket;
    private OutputStream outputStream;

    @Override
    public void load() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    private boolean checkBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (getPermissionState("bluetooth") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback");
    }

    @PermissionCallback
    private void bluetoothPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("bluetooth") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth não suportado neste dispositivo.");
            return;
        }

        if (!checkBluetoothPermissions()) {
            call.reject("Permissão de Bluetooth negada.");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth está desligado.");
            return;
        }

        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        JSArray devices = new JSArray();

        for (BluetoothDevice device : pairedDevices) {
            JSObject d = new JSObject();
            d.put("name", device.getName());
            d.put("address", device.getAddress());
            devices.put(d);
        }

        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.trim().isEmpty()) {
            call.reject("Endereço MAC não fornecido.");
            return;
        }
        address = address.trim();

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth não suportado neste dispositivo.");
            return;
        }

        if (!checkBluetoothPermissions()) {
            call.reject("Permissão de Bluetooth negada.");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth está desligado.");
            return;
        }

        BluetoothDevice foundDevice = null;
        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        for (BluetoothDevice device : pairedDevices) {
            if (address.equalsIgnoreCase(device.getAddress())) {
                foundDevice = device;
                break;
            }
        }

        if (foundDevice == null) {
            call.reject("Dispositivo Bluetooth pareado não encontrado: " + address);
            return;
        }

        final String finalAddress = address;
        final BluetoothDevice device = foundDevice;

        new Thread(() -> {
            try {
                Log.d(TAG, "Conectando em " + device.getName() + " (" + finalAddress + ")");
                bluetoothAdapter.cancelDiscovery();
                closeCurrentConnection();

                bluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                bluetoothSocket.connect();
                outputStream = bluetoothSocket.getOutputStream();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("connected", true);
                ret.put("name", device.getName());
                ret.put("address", finalAddress);
                Log.d(TAG, "Conectado em " + device.getName() + " (" + finalAddress + ")");
                call.resolve(ret);
            } catch (IOException e) {
                Log.e(TAG, "Falha ao conectar em " + finalAddress, e);
                closeCurrentConnection();
                call.reject("Falha ao conectar: " + e.getMessage());
            } catch (SecurityException e) {
                Log.e(TAG, "Permissão Bluetooth negada ao conectar", e);
                closeCurrentConnection();
                call.reject("Permissão Bluetooth negada ao conectar: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Nenhum dado fornecido.");
            return;
        }

        if (outputStream == null) {
            call.reject("Não conectado a nenhuma impressora.");
            return;
        }

        try {
            byte[] bytes = new byte[data.length()];
            for (int i = 0; i < data.length(); i++) {
                bytes[i] = (byte) data.charAt(i);
            }
            outputStream.write(bytes);
            outputStream.flush();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (IOException e) {
            Log.e(TAG, "Erro ao escrever dados", e);
            call.reject("Erro ao escrever dados: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeCurrentConnection();

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private void closeCurrentConnection() {
        try {
            if (outputStream != null) {
                outputStream.close();
                outputStream = null;
            }
        } catch (IOException e) {
            Log.w(TAG, "Erro ao fechar outputStream", e);
        }

        try {
            if (bluetoothSocket != null) {
                bluetoothSocket.close();
                bluetoothSocket = null;
            }
        } catch (IOException e) {
            Log.w(TAG, "Erro ao fechar socket", e);
        }
    }
}
