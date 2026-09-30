package com.flexable.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 로그인 유지용 Refresh Token 같은 비밀 값을 저장한다.
 * 값은 Android Keystore의 AES-256 키로 암호화(GCM)해 SharedPreferences에 넣는다.
 * 키는 기기 밖으로 꺼낼 수 없으므로 백업 · 파일 복사로 값이 새지 않는다.
 */
final class SecureStore {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "flexable_secure_store";
    private static final String PREFS = "flexable_secure_store";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;

    private final SharedPreferences prefs;

    SecureStore(Context context) {
        this.prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    synchronized void set(String key, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        ByteBuffer packed = ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted);
        prefs.edit().putString(key, Base64.encodeToString(packed.array(), Base64.NO_WRAP)).apply();
    }

    /** 값이 없거나 (키가 바뀌어) 복호화할 수 없으면 null. 복호화할 수 없는 값은 지운다. */
    synchronized String get(String key) {
        String stored = prefs.getString(key, null);
        if (stored == null) {
            return null;
        }
        try {
            byte[] packed = Base64.decode(stored, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, packed, 0, IV_LENGTH));
            byte[] plain = cipher.doFinal(packed, IV_LENGTH, packed.length - IV_LENGTH);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            remove(key);
            return null;
        }
    }

    synchronized void remove(String key) {
        prefs.edit().remove(key).apply();
    }

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
}
