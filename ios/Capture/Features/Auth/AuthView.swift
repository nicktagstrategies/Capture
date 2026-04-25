import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var mode: Mode = .signIn
    @State private var error: String?
    @State private var isBusy = false

    enum Mode { case signIn, signUp }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 40)
                Text("Capture").font(.captureLargeTitle).foregroundStyle(Color.captureInk)
                Text(mode == .signIn ? "Welcome back." : "Create your account.")
                    .font(.captureBody)
                    .foregroundStyle(Color.captureInkMuted)

                VStack(spacing: 12) {
                    if mode == .signUp {
                        TextField("Name", text: $name)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)
                            .padding().background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding().background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    SecureField("Password", text: $password)
                        .textContentType(mode == .signUp ? .newPassword : .password)
                        .padding().background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                if let error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }

                BookNowButton(title: mode == .signIn ? "Sign in" : "Create account", isDark: true) {
                    Task { await submit() }
                }
                .disabled(isBusy)

                Button(mode == .signIn ? "No account? Sign up" : "Have an account? Sign in") {
                    mode = mode == .signIn ? .signUp : .signIn
                }
                .font(.captureCaption)
                .foregroundStyle(Color.captureBlue)

                Divider().padding(.vertical, 8)

                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    Task { await handleApple(result) }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(24)
        }
        .background(Color.captureBackground.ignoresSafeArea())
    }

    private func submit() async {
        isBusy = true
        defer { isBusy = false }
        error = nil
        do {
            if mode == .signUp {
                struct Body: Encodable { let email: String; let password: String; let name: String }
                let resp: SessionResponse = try await APIClient.shared.post(
                    "/auth/email/signup",
                    body: Body(email: email, password: password, name: name),
                )
                await session.apply(session: resp)
            } else {
                struct Body: Encodable { let email: String; let password: String }
                let resp: SessionResponse = try await APIClient.shared.post(
                    "/auth/email/login",
                    body: Body(email: email, password: password),
                )
                await session.apply(session: resp)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let auth):
            guard
                let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                error = "Apple sign in failed"
                return
            }
            let displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }.joined(separator: " ")
            struct Body: Encodable { let idToken: String; let name: String? }
            do {
                let resp: SessionResponse = try await APIClient.shared.post(
                    "/auth/apple",
                    body: Body(idToken: idToken, name: displayName.isEmpty ? nil : displayName),
                )
                await session.apply(session: resp)
            } catch {
                self.error = error.localizedDescription
            }
        case .failure(let err):
            error = err.localizedDescription
        }
    }
}
