use std::{collections::VecDeque, ffi::OsString, path::Path, sync::Mutex};

pub const OPEN_BOOK_FILES_EVENT: &str = "open-book-files";

#[derive(Debug, Default)]
struct PendingOpenState {
    frontend_ready: bool,
    paths: VecDeque<String>,
}

#[derive(Debug, Default)]
pub struct PendingOpenFiles {
    state: Mutex<PendingOpenState>,
}

impl PendingOpenFiles {
    pub fn from_args(args: impl IntoIterator<Item = OsString>) -> Self {
        Self {
            state: Mutex::new(PendingOpenState {
                frontend_ready: false,
                paths: collect_book_paths(args).into(),
            }),
        }
    }

    pub fn take_and_mark_ready(&self) -> Vec<String> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.frontend_ready = true;
        state.paths.drain(..).collect()
    }

    pub fn route_new_paths(&self, paths: Vec<String>) -> Option<Vec<String>> {
        if paths.is_empty() {
            return None;
        }

        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());

        if state.frontend_ready {
            Some(paths)
        } else {
            state.paths.extend(paths);
            None
        }
    }
}

pub fn collect_book_paths<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let mut paths = Vec::new();

    for argument in args {
        let path = argument.into();
        let path = Path::new(&path);
        let supported = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "epub" | "txt" | "pdf"
                )
            });

        if supported {
            paths.push(path.to_string_lossy().into_owned());
        }
    }

    paths
}

#[cfg(test)]
mod tests {
    use super::{collect_book_paths, PendingOpenFiles};
    use std::ffi::OsString;

    #[test]
    fn collects_supported_book_paths_and_ignores_other_arguments() {
        let paths = collect_book_paths([
            OsString::from("ebook-reader-desktop.exe"),
            OsString::from(r"D:\Books\first.EPUB"),
            OsString::from(r"D:\Books\second.txt"),
            OsString::from("--flag"),
            OsString::from(r"D:\Books\third.pdf"),
        ]);

        assert_eq!(
            paths,
            vec![
                r"D:\Books\first.EPUB",
                r"D:\Books\second.txt",
                r"D:\Books\third.pdf"
            ]
        );
    }

    #[test]
    fn queues_paths_until_the_frontend_listener_is_ready() {
        let state = PendingOpenFiles::from_args([OsString::from(r"D:\Books\cold.txt")]);

        assert_eq!(
            state.route_new_paths(vec![r"D:\Books\early.epub".to_string()]),
            None
        );
        assert_eq!(
            state.take_and_mark_ready(),
            vec![r"D:\Books\cold.txt", r"D:\Books\early.epub"]
        );
        assert_eq!(
            state.route_new_paths(vec![r"D:\Books\warm.pdf".to_string()]),
            Some(vec![r"D:\Books\warm.pdf".to_string()])
        );
        assert!(state.take_and_mark_ready().is_empty());
    }
}
