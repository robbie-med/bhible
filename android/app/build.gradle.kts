import java.util.Properties

plugins {
    id("com.android.application")
}

// Signing credentials live in keystore.properties (gitignored), never in this file.
// Without it the release build still assembles, just unsigned — so a fresh clone works.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val hasSigningConfig = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "org.robbiemed.bhible"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.robbiemed.bhible"
        minSdk = 24
        targetSdk = 35
        versionCode = 5
        versionName = "1.1"
    }

    signingConfigs {
        if (hasSigningConfig) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = if (hasSigningConfig) signingConfigs.getByName("release") else null
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

