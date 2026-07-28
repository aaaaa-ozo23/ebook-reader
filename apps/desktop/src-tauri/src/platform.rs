use serde::Serialize;

pub const SUPPORTED_BOOK_FORMATS: [&str; 5] = ["epub", "txt", "pdf", "mobi", "azw3"];
pub const TARGET_TRIPLE: &str = env!("EBOOK_READER_TARGET_TRIPLE");

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPlatformCapabilities {
    pub platform: &'static str,
    pub architecture: &'static str,
    pub primary_modifier: &'static str,
    pub supported_formats: Vec<&'static str>,
    pub distribution_track: &'static str,
}

pub fn capabilities() -> DesktopPlatformCapabilities {
    capabilities_for(
        current_platform(),
        current_architecture(),
        option_env!("EBOOK_READER_BUILD_FLAVOR"),
    )
}

pub fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        panic!("unsupported desktop platform")
    }
}

pub fn current_architecture() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        panic!("unsupported desktop architecture")
    }
}

fn capabilities_for(
    platform: &'static str,
    architecture: &'static str,
    build_flavor: Option<&'static str>,
) -> DesktopPlatformCapabilities {
    DesktopPlatformCapabilities {
        platform,
        architecture,
        primary_modifier: if platform == "macos" {
            "meta"
        } else {
            "control"
        },
        supported_formats: SUPPORTED_BOOK_FORMATS.to_vec(),
        distribution_track: distribution_track_for(platform, build_flavor),
    }
}

fn distribution_track_for(
    platform: &'static str,
    build_flavor: Option<&'static str>,
) -> &'static str {
    match build_flavor {
        Some("nsis" | "msi" | "macos" | "appimage" | "deb") => {
            build_flavor.expect("matched build flavor")
        }
        Some(unsupported) => panic!("unsupported EBOOK_READER_BUILD_FLAVOR: {unsupported}"),
        None => match platform {
            "windows" => "nsis",
            "macos" => "macos",
            "linux" => "appimage",
            _ => panic!("unsupported desktop platform: {platform}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_matrix_uses_platform_modifiers_and_default_tracks() {
        assert_eq!(
            capabilities_for("windows", "x86_64", None),
            DesktopPlatformCapabilities {
                platform: "windows",
                architecture: "x86_64",
                primary_modifier: "control",
                supported_formats: SUPPORTED_BOOK_FORMATS.to_vec(),
                distribution_track: "nsis",
            }
        );
        assert_eq!(
            capabilities_for("macos", "aarch64", None).primary_modifier,
            "meta"
        );
        assert_eq!(
            capabilities_for("macos", "aarch64", None).distribution_track,
            "macos"
        );
        assert_eq!(
            capabilities_for("linux", "x86_64", None).distribution_track,
            "appimage"
        );
    }

    #[test]
    fn explicit_manual_and_automatic_tracks_are_preserved() {
        assert_eq!(
            capabilities_for("windows", "x86_64", Some("msi")).distribution_track,
            "msi"
        );
        assert_eq!(
            capabilities_for("linux", "x86_64", Some("deb")).distribution_track,
            "deb"
        );
        assert_eq!(
            capabilities_for("linux", "x86_64", Some("appimage")).distribution_track,
            "appimage"
        );
    }

    #[test]
    #[should_panic(expected = "unsupported EBOOK_READER_BUILD_FLAVOR")]
    fn invalid_build_flavor_fails_closed() {
        capabilities_for("windows", "x86_64", Some("portable"));
    }
}
