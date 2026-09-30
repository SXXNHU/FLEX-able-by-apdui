package com.flexable.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Pattern;

/**
 * 카드사 · 은행 결제 알림을 모은다. 사용자가 시스템 설정에서 알림 접근을 허용해야 동작한다.
 *
 * <p>여기서는 금액 · 가맹점을 판단하지 않고 원문만 큐에 넣는다 (해석은 서버 담당).
 * 다만 개인 메시지를 모으지 않도록 "금액(원)"과 결제 관련 단어가 함께 있는 알림만 저장한다.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    private static final String TAG = "FlexNotification";
    private static final Pattern MONEY = Pattern.compile("\\d[\\d,]*\\s*원");
    private static final Pattern PAYMENT_WORD = Pattern.compile("승인|결제|출금|입금|사용|이체|체크");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (getPackageName().equals(sbn.getPackageName())) {
            return;
        }
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return;
        }
        Bundle extras = notification.extras;
        String title = text(extras, Notification.EXTRA_TITLE);
        String text = text(extras, Notification.EXTRA_TEXT);
        String bigText = text(extras, Notification.EXTRA_BIG_TEXT);
        String combined = title + "\n" + text + "\n" + bigText;
        if (!MONEY.matcher(combined).find() || !PAYMENT_WORD.matcher(combined).find()) {
            return;
        }
        try {
            JSONObject item = new JSONObject();
            item.put("id", stableId(sbn));
            item.put("packageName", sbn.getPackageName());
            item.put("title", title);
            item.put("text", text);
            item.put("bigText", bigText);
            item.put("postedAt", sbn.getPostTime());
            new NotificationQueue(getApplicationContext()).add(item);
        } catch (Exception e) {
            Log.w(TAG, "Failed to queue notification", e);
        }
    }

    /**
     * 같은 알림이 다시 전달돼도 같은 값. 서버는 이 값으로 중복 반영을 막는다.
     * 알림 키에는 계정 정보가 섞일 수 있어 해시로 보낸다.
     */
    static String stableId(StatusBarNotification sbn) throws Exception {
        String raw = sbn.getKey() + "|" + sbn.getPostTime();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < 16; i++) {
            hex.append(String.format("%02x", digest[i]));
        }
        return hex.toString();
    }

    private static String text(Bundle extras, String key) {
        CharSequence value = extras == null ? null : extras.getCharSequence(key);
        return value == null ? "" : value.toString().trim();
    }
}
