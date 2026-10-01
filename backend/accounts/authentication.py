from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """
    DRF's session authentication, answering "not logged in" with 401.

    Stock SessionAuthentication defines no WWW-Authenticate challenge, so DRF
    reports an anonymous request as 403 Forbidden, the same status as "logged
    in but not allowed". The frontend has to tell those apart: 401 means
    "sign in again", 403 means "you can't do this". Declaring a challenge
    scheme is what makes DRF return 401.
    """

    def authenticate_header(self, request):
        return 'Session'
