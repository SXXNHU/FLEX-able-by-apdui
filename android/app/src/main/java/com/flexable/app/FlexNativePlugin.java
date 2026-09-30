package com.flexable.app;

import android.Manifest;
import android.content.ActivityNotFoundException;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 웹 앱이 쓰는 기기 기능. 금액 · 가맹점 판단 같은 업무 규칙은 두지 않는다 (서버 담당).
 */
@CapacitorPlugin(
    name = "FlexNative",
    permissions = { @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR }) }
)
public class FlexNativePlugin extends Plugin {

    private SecureStore secureStore;

    @Override
    public void load() {
        secureStore = new SecureStore(getContext());
    }

    /* ───────── 보안 저장소 ───────── */

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("value", secureStore.get(key));
        call.resolve(result);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            secureStore.set(key, value);
            call.resolve();
        } catch (Exception e) {
            call.reject("보안 저장소에 저장하지 못했어요.", e);
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key != null) {
            secureStore.remove(key);
        }
        call.resolve();
    }

    /* ───────── 캘린더 ───────── */

    @PluginMethod
    public void listCalendarEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "calendarPermissionCallback");
            return;
        }
        readEvents(call);
    }

    @PermissionCallback
    private void calendarPermissionCallback(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            readEvents(call);
        } else {
            call.reject("캘린더 읽기 권한이 없어요. 설정에서 허용해주세요.", "PERMISSION_DENIED");
        }
    }

    private void readEvents(PluginCall call) {
        String from = call.getString("from");
        String to = call.getString("to");
        if (from == null || to == null) {
            call.reject("from and to are required");
            return;
        }
        try {
            JSArray events = new JSArray();
            for (DeviceCalendar.Event event : DeviceCalendar.list(getContext(), from, to)) {
                JSObject item = new JSObject();
                item.put("title", event.title);
                item.put("date", event.date);
                item.put("allDay", event.allDay);
                events.put(item);
            }
            JSObject result = new JSObject();
            result.put("events", events);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("캘린더를 읽지 못했어요.", e);
        }
    }

    @PluginMethod
    public void addCalendarEvent(PluginCall call) {
        String title = call.getString("title");
        String date = call.getString("date");
        if (title == null || date == null) {
            call.reject("title and date are required");
            return;
        }
        try {
            getActivity().startActivity(DeviceCalendar.insertIntent(title, date, call.getString("description", "")));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("캘린더 앱을 찾지 못했어요.", "NO_CALENDAR_APP");
        } catch (Exception e) {
            call.reject("캘린더에 일정을 추가하지 못했어요.", e);
        }
    }
}
